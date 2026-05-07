import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact, Fundamentals } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

export interface CompanySummary {
  symbol: string;
  sector: string;
  totalClaims: number;
  checkedClaims: number;
  hitCount: number;
  missCount: number;
  partialCount: number;
  pendingCount: number;
  quarters: string[];          // source quarters with claims
  lastUpdated: string | null;
  hasChecks: boolean;
  hasFundamentals: boolean;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const summaries: CompanySummary[] = [];

    for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
      const base = path.join("data/intelligence", symbol);
      const claimsPath = path.join(base, "claims.json");
      const checksPath = path.join(base, "checks.json");
      const fundPath   = path.join(base, "fundamentals.json");

      const claims      = await readJson<ClaimsArtifact>(claimsPath);
      const checks      = await readJson<ChecksArtifact>(checksPath);
      const fundamentals = await readJson<Fundamentals>(fundPath);

      const totalClaims = claims
        ? Object.values(claims.byQuarter).reduce((s, c) => s + c.length, 0)
        : 0;
      const quarters = claims ? Object.keys(claims.byQuarter).sort() : [];

      let hitCount = 0, missCount = 0, partialCount = 0, pendingCount = 0;
      if (checks) {
        for (const batch of Object.values(checks.byTargetQuarter)) {
          for (const c of batch) {
            if (c.status === "hit")     hitCount++;
            if (c.status === "miss")    missCount++;
            if (c.status === "partial") partialCount++;
            if (c.status === "pending") pendingCount++;
          }
        }
      }
      // checkedClaims = decisive verdicts only (excludes no-data / ambiguous)
      const checkedClaims = hitCount + missCount + partialCount;

      summaries.push({
        symbol,
        sector,
        totalClaims,
        checkedClaims,
        hitCount,
        missCount,
        partialCount,
        pendingCount,
        quarters,
        lastUpdated: claims?.generatedAt ?? null,
        hasChecks: !!checks,
        hasFundamentals: !!fundamentals,
      });
    }

    return NextResponse.json(summaries);
  } catch (e) {
    console.error("[/api/intel/companies]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
