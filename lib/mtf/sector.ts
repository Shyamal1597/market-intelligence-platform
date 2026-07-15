/**
 * Reads the sector-classification cache built by
 * scripts/mtf-build-sector-cache.ts (data/mtf-sector-cache.json) -- real
 * BSE Sector/IndustryNew per symbol, entirely independent of the research-
 * coverage universe. Symbols missing from the cache are "Unclassified" in
 * the UI, never guessed.
 *
 * Re-reads the file on every call rather than caching in memory: the file
 * is small (a few hundred KB at most) and this keeps the dashboard always
 * reflecting the latest cache build without a dev-server restart.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const CACHE_PATH = path.join(process.cwd(), "data", "mtf-sector-cache.json");

export interface SectorInfo {
  sector: string;
  industry: string;
}

export function getSectorMap(): Record<string, SectorInfo> {
  if (!existsSync(CACHE_PATH)) return {};
  const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Record<
    string,
    SectorInfo & { scripCode: string; updatedAt: string }
  >;
  const out: Record<string, SectorInfo> = {};
  for (const [symbol, v] of Object.entries(raw)) {
    out[symbol] = { sector: v.sector, industry: v.industry };
  }
  return out;
}
