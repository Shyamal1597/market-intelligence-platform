/**
 * scripts/intel-build-index.ts
 *
 * Pre-builds data/intelligence/_index.json from claims + checks JSON files.
 * The /api/intel/companies route reads this file for instant response instead
 * of scanning all 100 stock directories on every request.
 *
 * Usage:
 *   npx tsx scripts/intel-build-index.ts
 *   npm run intel:index
 *
 * Run after any pipeline stage that produces claims.json or checks.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact } from "@/lib/intel/types";
import type { CompanySummary } from "@/app/api/intel/companies/route";

async function readJson<T>(filePath: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(filePath, "utf-8")) as T; }
  catch { return null; }
}

async function main() {
  console.log("Building _index.json…");
  const summaries: CompanySummary[] = [];

  for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
    const base = path.join("data/intelligence", symbol);
    const claims = await readJson<ClaimsArtifact>(path.join(base, "claims.json"));
    const checks  = await readJson<ChecksArtifact>(path.join(base, "checks.json"));

    const totalClaims = claims
      ? Object.values(claims.byQuarter).reduce((s, c) => s + c.length, 0)
      : 0;
    const quarters = claims ? Object.keys(claims.byQuarter).sort() : [];

    let metCount = 0, movingCount = 0, missCount = 0, pendingCount = 0;
    if (checks) {
      for (const batch of Object.values(checks.byTargetQuarter)) {
        for (const c of batch) {
          if (c.verdict === "met")     metCount++;
          if (c.verdict === "moving")  movingCount++;
          if (c.verdict === "miss")    missCount++;
          if (c.verdict === "pending") pendingCount++;
        }
      }
    }

    summaries.push({
      symbol,
      sector,
      totalClaims,
      // checkedClaims = decisive verdicts only (excludes pending / ambiguous)
      checkedClaims: metCount + movingCount + missCount,
      metCount,
      movingCount,
      missCount,
      pendingCount,
      quarters,
      lastUpdated: claims?.generatedAt ?? null,
      hasChecks: !!checks,
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    companies: summaries,
  };

  const indexPath = path.join("data/intelligence", "_index.json");
  await fs.writeFile(indexPath, JSON.stringify(out, null, 2), "utf-8");

  const withData = summaries.filter((s) => s.totalClaims > 0).length;
  console.log(`✓ _index.json written: ${summaries.length} symbols (${withData} with data)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
