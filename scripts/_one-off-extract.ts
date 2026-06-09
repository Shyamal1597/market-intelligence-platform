import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { extractClaimsForSymbol } from "@/lib/intel/extractClaims";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact } from "@/lib/intel/types";
import path from "node:path";
import { readFileSync, existsSync, readFile, writeFile } from "node:fs";
import { promisify } from "node:util";

const readFileAsync  = promisify(readFile);
const writeFileAsync = promisify(writeFile);

// Load .env.local manually (dotenv is not installed)
try {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env.local not required if key is already in env */ }

(async () => {
  const sym = process.argv[2];
  if (!sym || !SYMBOL_SECTOR[sym]) {
    console.error(`usage: npx tsx scripts/_one-off-extract.ts <SYMBOL> [--quarters=Q1-FY26,Q2-FY26] [--numCtx=24576] [--maxTokens=12288]`);
    console.error(`  valid symbols: ${Object.keys(SYMBOL_SECTOR).join(", ")}`);
    console.error(`  --quarters:  only (re-)process the listed quarters, merge with existing artifact`);
    console.error(`  --numCtx:    override Ollama context window (default: 20480)`);
    console.error(`  --maxTokens: override max output tokens (default: 8192 for Ollama, 4096 for Anthropic)`);
    process.exit(2);
  }
  // --quarters=Q1-FY26,Q4-FY26  → only process those quarters and MERGE into existing claims.json
  const quartersArg = process.argv.slice(3).find((a) => a.startsWith("--quarters="))?.split("=")[1];
  const onlyQuarters = quartersArg ? quartersArg.split(",").map((q) => q.trim()) : undefined;
  if (onlyQuarters) console.log(`[INFO] processing only quarters: ${onlyQuarters.join(", ")}`);

  // --numCtx=24576 → larger context window for transcripts that overflow 20k
  const numCtxArg = process.argv.slice(3).find((a) => a.startsWith("--numCtx="))?.split("=")[1];
  const numCtx = numCtxArg ? parseInt(numCtxArg, 10) : undefined;
  if (numCtx) console.log(`[INFO] using numCtx=${numCtx}`);

  // --maxTokens=12288 → increase generation limit for quarters with many claims
  const maxTokensArg = process.argv.slice(3).find((a) => a.startsWith("--maxTokens="))?.split("=")[1];
  const maxTokens = maxTokensArg ? parseInt(maxTokensArg, 10) : undefined;
  if (maxTokens) console.log(`[INFO] using maxTokens=${maxTokens}`);

  // --maxTranscriptChars=35000 → truncate long transcripts to avoid Ollama grammar sampler issues
  const maxTxArg = process.argv.slice(3).find((a) => a.startsWith("--maxTranscriptChars="))?.split("=")[1];
  const maxTranscriptChars = maxTxArg ? parseInt(maxTxArg, 10) : undefined;
  if (maxTranscriptChars) console.log(`[INFO] truncating transcripts to ${maxTranscriptChars} chars`);

  const sector   = SYMBOL_SECTOR[sym];
  const reg      = loadRegistry(sector);
  const outFile  = path.join("data/intelligence", sym, "claims.json");

  // Snapshot the existing artifact BEFORE extraction overwrites outFile.
  let preExisting: ClaimsArtifact | null = null;
  if (onlyQuarters && existsSync(outFile)) {
    try { preExisting = JSON.parse(await readFileAsync(outFile, "utf-8")); } catch { /* ignore */ }
  }

  const r = await extractClaimsForSymbol({
    symbol: sym,
    registry: reg,
    transcriptsDir: path.join("data/intelligence", sym, "transcripts"),
    outFile,
    registryHash: registryHash(reg),
    onlyQuarters,
    ...(numCtx            !== undefined && { numCtx }),
    ...(maxTokens         !== undefined && { maxTokens }),
    ...(maxTranscriptChars !== undefined && { maxTranscriptChars }),
  });

  // When only specific quarters were re-run, merge their results into the pre-existing artifact
  // so that previously-extracted quarters are preserved.
  if (onlyQuarters && preExisting) {
    try {
      const existing: ClaimsArtifact = preExisting;
      const merged: ClaimsArtifact = {
        ...existing,
        generatedAt: r.artifact.generatedAt,
        byQuarter: {
          ...existing.byQuarter,
          ...r.artifact.byQuarter, // new results overwrite re-processed quarters
        },
        warnings: [
          ...existing.warnings.filter((w) => !onlyQuarters.some((q) => w.startsWith(q))),
          ...r.artifact.warnings,
        ],
      };
      await writeFileAsync(outFile, JSON.stringify(merged, null, 2), "utf-8");
      const total = Object.values(merged.byQuarter).reduce((s, c) => s + c.length, 0);
      const quarters = Object.keys(merged.byQuarter).length;
      console.log(`[${sym}] merged: ${total} claims across ${quarters} quarters | cost ~$${r.totalCostUsd.toFixed(3)}`);
      if (merged.warnings.length) {
        console.log(`  warnings (${merged.warnings.length}):`, merged.warnings.slice(0, 5));
      }
      return;
    } catch {
      console.warn("[WARN] could not merge with existing artifact -- writing fresh");
    }
  }

  const total   = Object.values(r.artifact.byQuarter).reduce((s, c) => s + c.length, 0);
  const quarters = Object.keys(r.artifact.byQuarter).length;
  console.log(`[${sym}] ${total} claims across ${quarters} quarters | cost ~$${r.totalCostUsd.toFixed(3)}`);
  if (r.artifact.warnings.length) {
    console.log(`  warnings (${r.artifact.warnings.length}):`, r.artifact.warnings.slice(0, 5));
  }
})().catch((e) => { console.error(e); process.exit(1); });
