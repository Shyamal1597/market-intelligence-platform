#!/usr/bin/env tsx
/**
 * generate-summaries — Stage 5 CLI.
 *
 * Usage:
 *   npx tsx scripts/generate-summaries.ts <SYMBOL> [options]
 *   npx tsx scripts/generate-summaries.ts --all
 *
 * Options:
 *   --force          Re-generate even if summary exists
 *   --only=Q1-FY26   Process only this source quarter
 *   --all            Run all symbols
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { existsSync, readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env.local not required */ }

import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { loadRegistry } from "@/lib/intel/registry";
import { generateQuarterSummary } from "@/lib/intel/generateSummary";
import type { ClaimsArtifact, ChecksArtifact } from "@/lib/intel/types";

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
    force: flags.force === true,
    all: flags.all === true,
    onlyQuarter: flags.only as string | undefined,
  };
}

/** Resolve which quarter a set of checks was primarily verified in. */
function primaryVerifiedQuarter(
  sourceQuarter: string,
  claims: ClaimsArtifact,
  checks: ChecksArtifact,
): string | null {
  const allChecks = Object.values(checks.byTargetQuarter).flat();
  const checkById = Object.fromEntries(allChecks.map((c) => [c.claimId, c]));
  const verifiedQuarters = (claims.byQuarter[sourceQuarter] ?? [])
    .map((c) => checkById[c.id]?.verifiedInQuarter)
    .filter((q): q is string => !!q && q !== "unknown" && q !== sourceQuarter);
  if (verifiedQuarters.length === 0) return null;
  // Most common verifiedInQuarter
  const freq = new Map<string, number>();
  for (const q of verifiedQuarters) freq.set(q, (freq.get(q) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

(async () => {
  const opts = parseArgs();

  let symbols: string[] = [];
  if (opts.all) {
    symbols = Object.keys(SYMBOL_SECTOR);
  } else if (opts.symbol && SYMBOL_SECTOR[opts.symbol]) {
    symbols = [opts.symbol];
  } else {
    console.error("usage: npx tsx scripts/generate-summaries.ts <SYMBOL> [--force] [--only=Q1-FY26] [--all]");
    console.error(`  valid symbols: ${Object.keys(SYMBOL_SECTOR).join(", ")}`);
    process.exit(2);
  }

  let totalCost = 0;

  for (const sym of symbols) {
    const base = path.join("data/intelligence", sym);
    const claimsPath = path.join(base, "claims.json");
    const checksPath = path.join(base, "checks.json");
    const transcriptsDir = path.join(base, "transcripts");
    const summariesDir = path.join(base, "summaries");

    const claimsRaw = await fs.readFile(claimsPath, "utf-8").catch(() => null);
    const checksRaw = await fs.readFile(checksPath, "utf-8").catch(() => null);

    if (!claimsRaw) {
      console.log(`[${sym}] SKIP — no claims.json (run intel:rebuild first)`);
      continue;
    }
    if (!checksRaw) {
      console.log(`[${sym}] SKIP — no checks.json (run intel:crosscheck first)`);
      continue;
    }

    const claims: ClaimsArtifact = JSON.parse(claimsRaw);
    const checks: ChecksArtifact = JSON.parse(checksRaw);
    const registry = loadRegistry(SYMBOL_SECTOR[sym]);

    await fs.mkdir(summariesDir, { recursive: true });

    const quarters = Object.keys(claims.byQuarter).sort();

    for (const sourceQ of quarters) {
      if (opts.onlyQuarter && opts.onlyQuarter !== sourceQ) continue;

      const outFile = path.join(summariesDir, `${sourceQ}.json`);
      if (!opts.force && existsSync(outFile)) {
        console.log(`[${sym}][${sourceQ}] skip (summary exists, use --force)`);
        continue;
      }

      const verifiedIn = primaryVerifiedQuarter(sourceQ, claims, checks);
      if (!verifiedIn) {
        console.log(`[${sym}][${sourceQ}] SKIP — no verified checks yet`);
        continue;
      }

      const srcTranscriptPath = path.join(transcriptsDir, `${sourceQ}.txt`);
      const tgtTranscriptPath = path.join(transcriptsDir, `${verifiedIn}.txt`);

      if (!existsSync(srcTranscriptPath) || !existsSync(tgtTranscriptPath)) {
        console.log(`[${sym}][${sourceQ}] SKIP — transcript missing (${sourceQ} or ${verifiedIn})`);
        continue;
      }

      const sourceTranscript = await fs.readFile(srcTranscriptPath, "utf-8");
      const targetTranscript = await fs.readFile(tgtTranscriptPath, "utf-8");

      console.log(`[${sym}][${sourceQ}] generating summary (verified in ${verifiedIn})…`);

      try {
        const { summary, costUsd } = await generateQuarterSummary({
          symbol: sym,
          sourceQuarter: sourceQ,
          verifiedInQuarter: verifiedIn,
          sourceTranscript,
          targetTranscript,
          claims,
          checks,
          registry,
        });

        await fs.writeFile(outFile, JSON.stringify(summary, null, 2), "utf-8");
        totalCost += costUsd;
        console.log(`[${sym}][${sourceQ}] done — onTrack ${summary.onTrackPct}% | cost ~$${costUsd.toFixed(4)}`);
      } catch (e) {
        console.error(`[${sym}][${sourceQ}] ERROR:`, (e as Error).message);
      }
    }
  }

  if (totalCost > 0) {
    console.log(`\nTotal cost: ~$${totalCost.toFixed(4)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
