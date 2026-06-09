/**
 * lib/intel/dataQuality.ts
 *
 * Data quality assessment for per-symbol intelligence data.
 * Used by both /api/intel/companies (live scan) and buildIndex (pre-build).
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import type { ClaimsArtifact, ChecksArtifact } from "@/lib/intel/types";

// -- Types ---------------------------------------------------------------------

export type DataQualitySeverity = "error" | "warn" | "info";

export interface DataQualityNote {
  severity: DataQualitySeverity;
  code: string;       // machine-readable key
  message: string;    // human-readable summary
  detail?: string;    // optional longer explanation / remedy
}

export interface DataQuality {
  transcriptCount: number;
  claimCount: number;
  hasIssues: boolean;
  notes: DataQualityNote[];
}

// -- Helpers -------------------------------------------------------------------

/** Comparable integer for chronological quarter ordering. Q1-FY18 < Q2-FY18 … */
export function quarterKey(q: string): number {
  const m = q.match(/^Q(\d)-FY(\d+)$/);
  if (!m) return 0;
  return parseInt(m[2]) * 10 + parseInt(m[1]);
}

export function getTranscriptQuarters(symbolBase: string): string[] {
  try {
    const txDir = path.join(symbolBase, "transcripts");
    return readdirSync(txDir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => f.replace(".txt", ""));
  } catch {
    return [];
  }
}

// -- Core quality builder ------------------------------------------------------

export function buildDataQuality(
  symbol: string,
  txQuarters: string[],
  claims: ClaimsArtifact | null,
  checks: ChecksArtifact | null,
): DataQuality {
  const notes: DataQualityNote[] = [];
  const claimCount = claims
    ? Object.values(claims.byQuarter).reduce((s, c) => s + c.length, 0)
    : 0;

  // -- 1. No transcripts at all ---------------------------------------------
  if (txQuarters.length === 0) {
    notes.push({
      severity: "error",
      code: "NO_TRANSCRIPTS",
      message: "No earnings call transcripts available.",
      detail: `BSE download failed during seeding. Retry: npx tsx scripts/intel-seed-transcripts.ts ${symbol}`,
    });
    return { transcriptCount: 0, claimCount: 0, hasIssues: true, notes };
  }

  // -- 2. Missing recent quarters -------------------------------------------
  const txSet = new Set(txQuarters);
  const missingQ4 = !txSet.has("Q4-FY26");
  const missingQ3 = !txSet.has("Q3-FY26");
  if (missingQ4 && missingQ3) {
    notes.push({
      severity: "warn",
      code: "MISSING_RECENT_QUARTERS",
      message: "Missing Q3-FY26 and Q4-FY26 transcripts.",
      detail: "BSE only retains PDF attachments for ~2 months. Upload manually via the Transcript Upload button.",
    });
  } else if (missingQ4) {
    notes.push({
      severity: "warn",
      code: "MISSING_Q4_FY26",
      message: "Q4-FY26 transcript not available.",
      detail: "Seeder ran and found no Q4-FY26 PDF via BSE or Screener. Upload manually via the Transcript Upload button if you have a Bloomberg transcript.",
    });
  }

  // -- 3. Claims file missing (pipeline never run) --------------------------
  if (!claims) {
    notes.push({
      severity: "warn",
      code: "NO_CLAIMS_FILE",
      message: `Claim extraction not yet run -- ${txQuarters.length} transcript${txQuarters.length !== 1 ? "s" : ""} on disk, none processed.`,
      detail: `Run: npm run intel:rebuild ${symbol} --stage=3`,
    });
    return { transcriptCount: txQuarters.length, claimCount: 0, hasIssues: notes.length > 0, notes };
  }

  // -- 4. Claims file empty due to LLM errors -------------------------------
  if (claimCount === 0 && claims.warnings && claims.warnings.length > 0) {
    const isOllamaFailure =
      (claims as { model?: string }).model === "qwen2.5:7b" ||
      claims.warnings.some(
        (w) => w.includes("fetch failed") || w.includes("Ollama") || w.includes("LLM error"),
      );
    const failedQtrs = Object.keys(claims.byQuarter).filter(
      (q) => (claims.byQuarter[q] ?? []).length === 0,
    );
    notes.push({
      severity: "error",
      code: "CLAIMS_EXTRACTION_FAILED",
      message: `Claim extraction failed -- ${failedQtrs.length} quarter${failedQtrs.length !== 1 ? "s" : ""} returned no results.${isOllamaFailure ? " (local model offline)" : ""}`,
      detail: `Affected quarters: ${failedQtrs.join(", ")}. Re-run: npm run intel:rebuild ${symbol} --stage=3`,
    });
  }

  // -- 5. Stale pending checks (target quarter predates source quarter) -----
  if (checks) {
    let stalePendingCount = 0;
    for (const [tq, batch] of Object.entries(checks.byTargetQuarter)) {
      if (tq === "unknown") continue;
      for (const c of batch) {
        if (c.verdict === "pending" && quarterKey(tq) < quarterKey(c.sourceQuarter)) {
          stalePendingCount++;
        }
      }
    }
    if (stalePendingCount > 0) {
      notes.push({
        severity: "warn",
        code: "STALE_PENDING",
        message: `${stalePendingCount} check${stalePendingCount !== 1 ? "s" : ""} have an incorrect target quarter assignment.`,
        detail:
          "Stage 4 (cross-check) bucketed these claims under a quarter that predates their source. Re-run Stage 4 to correct.",
      });
    }
  }

  // -- 6. Recent transcripts not yet processed by Stage 3 ------------------
  if (claims && claimCount > 0) {
    const claimQtrs = new Set(Object.keys(claims.byQuarter));
    const uncovered = txQuarters
      .filter((q) => quarterKey(q) >= quarterKey("Q3-FY25") && !claimQtrs.has(q))
      .sort((a, b) => quarterKey(a) - quarterKey(b));
    if (uncovered.length > 0) {
      notes.push({
        severity: "info",
        code: "UNCOVERED_QUARTERS",
        message: `${uncovered.length} recent transcript${uncovered.length !== 1 ? "s" : ""} awaiting claim extraction.`,
        detail: `Unprocessed quarters: ${uncovered.join(", ")}. Run: npm run intel:rebuild ${symbol} --stage=3`,
      });
    }
  }

  return {
    transcriptCount: txQuarters.length,
    claimCount,
    hasIssues: notes.length > 0,
    notes,
  };
}
