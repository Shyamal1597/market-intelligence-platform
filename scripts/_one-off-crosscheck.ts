import { loadRegistry } from "@/lib/intel/registry";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { claimsHash } from "@/lib/intel/extractClaims";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { ClaimsArtifact } from "@/lib/intel/types";

// Load .env.local manually
try {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env.local not required */ }

(async () => {
  const sym = process.argv[2];
  if (!sym || !SYMBOL_SECTOR[sym]) {
    console.error(`usage: npx tsx scripts/_one-off-crosscheck.ts <SYMBOL>`);
    console.error(`  valid symbols: ${Object.keys(SYMBOL_SECTOR).join(", ")}`);
    process.exit(2);
  }

  const sector = SYMBOL_SECTOR[sym];
  const reg = loadRegistry(sector);
  const base = path.join("data/intelligence", sym);

  const claims: ClaimsArtifact = JSON.parse(
    readFileSync(path.join(base, "claims.json"), "utf-8")
  );

  const cHash = claimsHash(claims);

  const r = await crossCheckForSymbol({
    symbol: sym,
    claims,
    transcriptsDir: path.join(base, "transcripts"),
    registry: reg,
    outFile: path.join(base, "checks.json"),
    claimsHashValue: cHash,
  });

  const all   = Object.values(r.artifact.byTargetQuarter).flat();
  const total = all.length;
  const met     = all.filter((c) => c.verdict === "met").length;
  const moving  = all.filter((c) => c.verdict === "moving").length;
  const miss    = all.filter((c) => c.verdict === "miss").length;
  const pending = all.filter((c) => c.verdict === "pending").length;
  const ambig   = all.filter((c) => c.verdict === "ambiguous").length;
  console.log(`[${sym}] ${total} checks | met ${met} moving ${moving} miss ${miss} pending ${pending} ambiguous ${ambig} | cost ~$${r.totalCostUsd.toFixed(3)}`);
  if (r.artifact.warnings.length) {
    console.log(`  warnings:`, r.artifact.warnings.slice(0, 5));
  }
})().catch((e) => { console.error(e); process.exit(1); });
