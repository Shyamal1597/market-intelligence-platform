#!/usr/bin/env tsx
/**
 * intel-rebuild — CLI orchestrator for the Intel Dashboard pipeline.
 *
 * Usage:
 *   npx tsx scripts/intel-rebuild.ts <SYMBOL> [options]
 *
 * Options:
 *   --stage=<1|2|3|4>   Run only the specified stage (1=parseExcel [optional] 2=transcripts 3=extractClaims 4=crossCheck)
 *   --force             Re-run even if output is current
 *   --all               Run all symbols (BAJAJFINSV + HDFCBANK)
 *   --only=<Q1-FY26>    Process only this quarter (stage 3 & 4)
 *   --cost-cap=<N>      Abort if cumulative LLM cost exceeds $N (default: 10)
 *   --concurrency=<N>   Max parallel symbols (default: 4)
 *   --dry-run           Print plan without executing
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY   — enables Anthropic backend (set in .env.local)
 *   LLM_BACKEND=ollama  — force local Ollama even if API key is present
 *   OLLAMA_BASE_URL     — override Ollama endpoint (default: http://localhost:11434)
 */

import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";

// Load .env.local (dotenv is not a dependency)
try {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env.local not required */ }

import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { parseExcel, writeFundamentals } from "@/lib/intel/parseExcel";
import { ingestTranscripts } from "@/lib/intel/transcripts";
import { extractClaimsForSymbol } from "@/lib/intel/extractClaims";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { claimsHash } from "@/lib/intel/extractClaims";
import { activeBackend, defaultExtractionModel, defaultVerificationModel } from "@/lib/intel/llm";
import type { ClaimsArtifact } from "@/lib/intel/types";

// ── CLI parsing ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      flags[key] = val ?? true;
    } else {
      positional.push(arg);
    }
  }

  return {
    symbol: positional[0] ?? null,
    stage: flags.stage ? parseInt(flags.stage as string) : null,
    force: flags.force === true,
    all: flags.all === true,
    onlyQuarters: flags.only ? (flags.only as string).split(",") : undefined,
    costCap: flags["cost-cap"] ? parseFloat(flags["cost-cap"] as string) : 10,
    dryRun: flags["dry-run"] === true,
    concurrency: Math.max(1, flags.concurrency ? parseInt(flags.concurrency as string) : 4),
  };
}

// ── data paths ────────────────────────────────────────────────────────────────

function dataPaths(symbol: string) {
  const base = path.join("data/intelligence", symbol);
  return {
    fundamentals:  path.join(base, "fundamentals.json"),
    transcripts:   path.join(base, "transcripts"),
    claims:        path.join(base, "claims.json"),
    checks:        path.join(base, "checks.json"),
  };
}

/** Known Excel filename overrides when the file doesn't match the symbol name. */
const EXCEL_PATHS: Record<string, string> = {
  BAJAJFINSV: "Bajaj finserve.xlsx",
  HDFCBANK:   "HDFC.xlsx",
};

function excelGlob(symbol: string): string | null {
  const concallDir = "Concall Data/Fundamental data";
  if (!existsSync(concallDir)) return null;
  // Check known overrides first, then fall back to convention-based names
  const candidates = [
    EXCEL_PATHS[symbol] ? path.join(concallDir, EXCEL_PATHS[symbol]) : null,
    path.join(concallDir, `${symbol}.xlsx`),
    path.join(concallDir, `${symbol}_Fundamentals.xlsx`),
  ].filter(Boolean) as string[];
  return candidates.find(existsSync) ?? null;
}

function transcriptDir(symbol: string): string {
  return path.join("Concall Data", symbol);
}

// ── stage runners ─────────────────────────────────────────────────────────────

async function runStage1(symbol: string, opts: ReturnType<typeof parseArgs>): Promise<import("@/lib/intel/types").Fundamentals | null> {
  const paths = dataPaths(symbol);
  const sector = SYMBOL_SECTOR[symbol];
  const reg = loadRegistry(sector);

  if (!opts.force && existsSync(paths.fundamentals)) {
    log(symbol, "stage1", "skip (output current, use --force to re-run)");
    return JSON.parse(await fs.readFile(paths.fundamentals, "utf-8")) as import("@/lib/intel/types").Fundamentals;
  }

  const xlsxFile = excelGlob(symbol);
  if (!xlsxFile) {
    log(symbol, "stage1", `SKIP — no Excel file found in Concall Data/Fundamental data/`);
    return null;
  }

  if (opts.dryRun) {
    log(symbol, "stage1", `DRY-RUN: would parse ${xlsxFile}`);
    return null;
  }

  log(symbol, "stage1", `parsing ${xlsxFile}…`);
  const fund = await parseExcel({ symbol, ticker: symbol, registry: reg, xlsxPath: xlsxFile });
  await writeFundamentals(symbol, fund);
  const total = Object.keys(fund.quarters).length;
  log(symbol, "stage1", `${total} quarters extracted (${fund.warnings.length} warnings)`);
  return fund;
}

async function runStage2(symbol: string, opts: ReturnType<typeof parseArgs>): Promise<void> {
  const paths = dataPaths(symbol);
  const srcDir = transcriptDir(symbol);

  if (!existsSync(srcDir)) {
    log(symbol, "stage2", `SKIP — no transcript source dir: ${srcDir}`);
    return;
  }

  if (!opts.force && existsSync(paths.transcripts)) {
    const existing = await fs.readdir(paths.transcripts).catch(() => []);
    if (existing.length > 0) {
      log(symbol, "stage2", `skip (${existing.length} transcripts present, use --force)`);
      return;
    }
  }

  if (opts.dryRun) {
    log(symbol, "stage2", `DRY-RUN: would ingest from ${srcDir}`);
    return;
  }

  log(symbol, "stage2", `ingesting transcripts from ${srcDir}…`);
  const manifest = await ingestTranscripts({
    symbol,
    inputDir: srcDir,
    outputDir: paths.transcripts,
  });
  log(symbol, "stage2", `${manifest.ingested.length} transcripts ingested (${manifest.duplicatesSkipped.length} duplicates skipped)`);
}

async function runStage3(
  symbol: string,
  opts: ReturnType<typeof parseArgs>,
  totalCost: { v: number },
): Promise<ClaimsArtifact | null> {
  const paths = dataPaths(symbol);
  const sector = SYMBOL_SECTOR[symbol];
  const reg = loadRegistry(sector);

  if (!opts.force && existsSync(paths.claims)) {
    log(symbol, "stage3", "skip (output current, use --force to re-run)");
    return JSON.parse(await fs.readFile(paths.claims, "utf-8")) as ClaimsArtifact;
  }

  if (!existsSync(paths.transcripts)) {
    log(symbol, "stage3", "SKIP — run stage 2 first");
    return null;
  }

  if (opts.dryRun) {
    const tFiles = await fs.readdir(paths.transcripts).catch(() => []);
    log(symbol, "stage3", `DRY-RUN: would extract claims from ${tFiles.length} transcripts using ${defaultExtractionModel()} (backend: ${activeBackend()})`);
    return null;
  }

  log(symbol, "stage3", `extracting claims via ${activeBackend()}:${defaultExtractionModel()}…`);
  const r = await extractClaimsForSymbol({
    symbol,
    registry: reg,
    transcriptsDir: paths.transcripts,
    outFile: paths.claims,
    registryHash: registryHash(reg),
    onlyQuarters: opts.onlyQuarters,
  });
  totalCost.v += r.totalCostUsd;

  const total = Object.values(r.artifact.byQuarter).reduce((s, c) => s + c.length, 0);
  const quarters = Object.keys(r.artifact.byQuarter).length;
  log(symbol, "stage3", `${total} claims across ${quarters} quarters | cost ~$${r.totalCostUsd.toFixed(3)}`);
  if (r.artifact.warnings.length) {
    log(symbol, "stage3", `warnings: ${r.artifact.warnings.slice(0, 3).join("; ")}`);
  }
  return r.artifact;
}

async function runStage4(
  symbol: string,
  opts: ReturnType<typeof parseArgs>,
  totalCost: { v: number },
): Promise<void> {
  const paths = dataPaths(symbol);
  const sector = SYMBOL_SECTOR[symbol];
  const reg = loadRegistry(sector);

  if (!existsSync(paths.claims)) {
    log(symbol, "stage4", "SKIP — run stage 3 first");
    return;
  }
  if (!existsSync(paths.transcripts)) {
    log(symbol, "stage4", "SKIP — run stage 2 first (no transcripts dir)");
    return;
  }

  if (!opts.force && existsSync(paths.checks)) {
    log(symbol, "stage4", "skip (output current, use --force to re-run)");
    return;
  }

  if (opts.dryRun) {
    log(symbol, "stage4", `DRY-RUN: would cross-check via ${activeBackend()}:${defaultVerificationModel()}`);
    return;
  }

  const claims: ClaimsArtifact = JSON.parse(await fs.readFile(paths.claims, "utf-8"));
  const cHash = claimsHash(claims);

  log(symbol, "stage4", `cross-checking via ${activeBackend()}:${defaultVerificationModel()}…`);
  const r = await crossCheckForSymbol({
    symbol,
    claims,
    transcriptsDir: paths.transcripts,
    registry: reg,
    outFile: paths.checks,
    claimsHashValue: cHash,
    onlyQuarters: opts.onlyQuarters,
  });
  totalCost.v += r.totalCostUsd;

  const all = Object.values(r.artifact.byTargetQuarter).flat();
  const met  = all.filter((c) => c.verdict === "met").length;
  const mov  = all.filter((c) => c.verdict === "moving").length;
  const miss = all.filter((c) => c.verdict === "miss").length;
  log(symbol, "stage4", `${all.length} checks | met ${met} moving ${mov} miss ${miss} | cost ~$${r.totalCostUsd.toFixed(3)}`);
}

// ── logging ───────────────────────────────────────────────────────────────────

function log(symbol: string, stage: string, msg: string) {
  console.log(`[${symbol}][${stage}] ${msg}`);
}

// ── Concurrency semaphore ─────────────────────────────────────────────────────

function makeSemaphore(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const opts = parseArgs();

  // Determine which symbols to process
  let symbols: string[] = [];
  if (opts.all) {
    symbols = Object.keys(SYMBOL_SECTOR);
  } else if (opts.symbol && SYMBOL_SECTOR[opts.symbol]) {
    symbols = [opts.symbol];
  } else {
    console.error("usage: npx tsx scripts/intel-rebuild.ts <SYMBOL> [--stage=N] [--force] [--all] [--dry-run]");
    console.error(`  valid symbols: ${Object.keys(SYMBOL_SECTOR).join(", ")}`);
    process.exit(2);
  }

  if (opts.dryRun) {
    console.log(`[dry-run] backend=${activeBackend()} extract=${defaultExtractionModel()} verify=${defaultVerificationModel()}`);
  }

  const totalCost = { v: 0 };

  const sem = makeSemaphore(opts.concurrency);
  if (symbols.length > 1) {
    console.log(`Running ${symbols.length} symbols with concurrency=${opts.concurrency}`);
  }

  const jobs = symbols.map((sym) =>
    sem(async () => {
      const runStages = opts.stage ? [opts.stage] : [1, 2, 3, 4];
      try {
        if (runStages.includes(1)) await runStage1(sym, opts);
        if (runStages.includes(2)) await runStage2(sym, opts);
        if (runStages.includes(3)) {
          if (totalCost.v > opts.costCap) {
            log(sym, "stage3", `SKIP — cost cap $${opts.costCap} exceeded`);
            return;
          }
          await runStage3(sym, opts, totalCost);
        }
        if (runStages.includes(4)) {
          if (totalCost.v > opts.costCap) {
            log(sym, "stage4", `SKIP — cost cap $${opts.costCap} exceeded`);
            return;
          }
          await runStage4(sym, opts, totalCost);
        }
      } catch (e) {
        log(sym, "error", (e as Error).message ?? String(e));
      }
    })
  );

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`\n${failed.length} symbol(s) failed.`);
  }

  if (totalCost.v > 0) {
    console.log(`\nTotal LLM cost: ~$${totalCost.v.toFixed(4)}`);
  }

  // Rebuild companies index after pipeline run
  console.log("\nRebuilding companies index…");
  const indexResult = spawnSync("npx", ["tsx", "scripts/intel-build-index.ts"], {
    stdio: "inherit",
    shell: true,
  });
  if (indexResult.status !== 0) {
    console.warn("Warning: intel:index rebuild failed (non-fatal)");
  }
})().catch((e) => { console.error(e); process.exit(1); });
