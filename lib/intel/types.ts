export type SectorKey = "insurance-holding" | "bank";

export type Unit = "%" | "Cr" | "bps" | "x" | "ratio" | "count";
export type Direction = "lower-is-better" | "higher-is-better" | "neutral";

export interface RegistryMetric {
  key: string;
  label: string;
  unit: Unit;
  direction: Direction;
  segment: string;
  excel: {
    sheet: string;
    rowLabelMatch: string[];
  };
  aliases: string[];
  description: string;
}

export interface SectorRegistry {
  sector: SectorKey;
  metrics: RegistryMetric[];
}

// ── Fundamentals (Stage 1 output) ───────────────────────────────────────────
export interface QuarterFundamentals {
  endDate: string;
  metrics: { [registryKey: string]: number | null };
}

export interface Fundamentals {
  symbol: string;
  ticker: string;
  unit: "Cr";
  quarters: { [quarterLabel: string]: QuarterFundamentals };
  estimates?: { [quarterLabel: string]: QuarterFundamentals };
  warnings: string[];
}

// ── Claims (Stage 3 output) ─────────────────────────────────────────────────
export type ClaimDirection = "value" | "range" | "up" | "down" | "stable";
export type Confidence = "high" | "medium" | "low";

export interface ExtractedClaim {
  id: string;
  metricKey: string;
  quote: string;
  speaker: string | null;
  direction: ClaimDirection;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetQuarter: string | null;
  targetText: string;
  confidence: Confidence;
  conditional: string | null;
}

export interface ClaimsArtifact {
  symbol: string;
  promptVersion: number;
  model: string;
  generatedAt: string;
  registryHash: string;
  byQuarter: { [sourceQuarter: string]: ExtractedClaim[] };
  warnings: string[];
}

// ── Checks (Stage 4 output) ─────────────────────────────────────────────────
/** Verdict rendered by reading the target quarter's earnings transcript. */
export type Verdict = "met" | "moving" | "miss" | "pending" | "ambiguous";

export interface ClaimCheck {
  claimId: string;
  metricKey: string;
  sourceQuarter: string;
  /** Quarter the claim targets (resolved). */
  targetQuarter: string;
  /** Actual transcript quarter used for verification (may differ for rolling claims). */
  verifiedInQuarter: string;
  verdict: Verdict;
  /** What management said about the actual outcome in the target transcript. */
  actualText: string | null;
  /** Verbatim quote from the target transcript (≤200 chars). */
  quote: string | null;
  reasoning: string;
  context: string | null;   // ±500 chars around quote in target transcript (display only)
  speaker: string | null;   // who said it in target transcript
  section: string | null;   // "prepared remarks" | "Q&A" | null
}

export interface ChecksArtifact {
  symbol: string;
  promptVersion: number;
  model: string;
  generatedAt: string;
  claimsHash: string;
  byTargetQuarter: { [targetQuarter: string]: ClaimCheck[] };
  warnings: string[];
}

export interface QuarterSummary {
  symbol: string;
  sourceQuarter: string;
  verifiedInQuarter: string;
  generatedAt: string;
  model: string;
  /** 2-3 sentence analyst-note headline. */
  headline: string;
  /** Segment key → 1-2 sentence performance note. */
  segments: Record<string, string>;
  /** 2-4 key themes / watchpoints. */
  keyThemes: string[];
  verdictCounts: {
    met: number; moving: number; miss: number;
    pending: number; ambiguous: number;
  };
  /** (met + moving) / (met + moving + miss) × 100 */
  onTrackPct: number;
}

// ── Symbol → sector ─────────────────────────────────────────────────────────
export const SYMBOL_SECTOR: Record<string, SectorKey> = {
  BAJAJFINSV: "insurance-holding",
  HDFCBANK: "bank",
};
