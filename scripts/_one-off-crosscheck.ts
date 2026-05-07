import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { claimsHash } from "@/lib/intel/extractClaims";
import { fundamentalsHash } from "@/lib/intel/parseExcel";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { ClaimsArtifact, Fundamentals } from "@/lib/intel/types";

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
  const fund: Fundamentals = JSON.parse(
    readFileSync(path.join(base, "fundamentals.json"), "utf-8")
  );

  const cHash = claimsHash(claims);
  const fHash = fundamentalsHash(fund);

  const r = await crossCheckForSymbol({
    symbol: sym,
    claims,
    fundamentals: fund,
    registry: reg,
    outFile: path.join(base, "checks.json"),
    claimsHashValue: cHash,
    fundamentalsHashValue: fHash,
  });

  const total = Object.values(r.artifact.byTargetQuarter).reduce((s, c) => s + c.length, 0);
  const hit  = Object.values(r.artifact.byTargetQuarter).flat().filter(c => c.status === "hit").length;
  const miss = Object.values(r.artifact.byTargetQuarter).flat().filter(c => c.status === "miss").length;
  console.log(`[${sym}] ${total} checks | hit ${hit} miss ${miss} | cost ~$${r.totalCostUsd.toFixed(3)}`);
  if (r.artifact.warnings.length) {
    console.log(`  warnings:`, r.artifact.warnings.slice(0, 5));
  }
})().catch((e) => { console.error(e); process.exit(1); });
