import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact } from "@/lib/intel/types";
import {
  buildDataQuality,
  getTranscriptQuarters,
} from "@/lib/intel/dataQuality";

export const dynamic = "force-dynamic";

// Re-export types so components can import from here
export type { DataQuality, DataQualityNote, DataQualitySeverity } from "@/lib/intel/dataQuality";

export interface CompanySummary {
  symbol: string;
  sector: string;
  totalClaims: number;
  checkedClaims: number;
  metCount: number;
  movingCount: number;
  missCount: number;
  pendingCount: number;
  quarters: string[];          // source quarters with claims
  lastUpdated: string | null;
  hasChecks: boolean;
  dataQuality: import("@/lib/intel/dataQuality").DataQuality;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // ── Fast path: pre-built index ─────────────────────────────────────────
    // Note: index is only used if it includes dataQuality; old index files
    // will be missing this field and are skipped via the catch below.
    const indexPath = path.join("data/intelligence", "_index.json");
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      const { companies } = JSON.parse(raw) as { generatedAt: string; companies: CompanySummary[] };
      // Guard: only use index if it has dataQuality (post-refactor)
      if (companies.length > 0 && companies[0].dataQuality !== undefined) {
        return NextResponse.json(companies);
      }
    } catch {
      // Index not built yet or outdated — fall through to live scan
    }

    const summaries: CompanySummary[] = [];

    for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
      const base = path.join("data/intelligence", symbol);
      const claimsPath = path.join(base, "claims.json");
      const checksPath = path.join(base, "checks.json");

      const claims = await readJson<ClaimsArtifact>(claimsPath);
      const checks = await readJson<ChecksArtifact>(checksPath);
      const txQuarters = getTranscriptQuarters(base);

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
      const checkedClaims = metCount + movingCount + missCount;

      const dataQuality = buildDataQuality(symbol, txQuarters, claims, checks);

      summaries.push({
        symbol,
        sector,
        totalClaims,
        checkedClaims,
        metCount,
        movingCount,
        missCount,
        pendingCount,
        quarters,
        lastUpdated: claims?.generatedAt ?? null,
        hasChecks: !!checks,
        dataQuality,
      });
    }

    return NextResponse.json(summaries);
  } catch (e) {
    console.error("[/api/intel/companies]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
