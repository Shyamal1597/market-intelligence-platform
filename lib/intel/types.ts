export type SectorKey =
  | "bank"
  | "insurance-holding"
  | "nbfc"
  | "insurance-life"
  | "financial-services"
  | "it-services"
  | "pharma"
  | "auto"
  | "fmcg"
  | "oil-gas-energy"
  | "metals-mining"
  | "power-utilities"
  | "telecom"
  | "cement-building"
  | "capital-goods-infra"
  | "defence"
  | "consumer-retail"
  | "aviation"
  | "real-estate";

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
  /** Human-readable full names for each segment key, e.g. "BAGIC" → "Bajaj Allianz General Insurance" */
  segmentDescriptions?: Record<string, string>;
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
  section: "prepared remarks" | "Q&A" | null;
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
// NIFTY 50 + NIFTY Next 50 universe (~100 stocks)
export const SYMBOL_SECTOR: Record<string, SectorKey> = {
  // ── Banking ───────────────────────────────────────────────────────────────
  HDFCBANK:    "bank",
  ICICIBANK:   "bank",
  SBIN:        "bank",
  AXISBANK:    "bank",
  KOTAKBANK:   "bank",
  BANKBARODA:  "bank",
  UNIONBANK:   "bank",
  PNB:         "bank",
  CANBK:       "bank",

  // ── Insurance — Holding / Diversified ─────────────────────────────────────
  BAJAJFINSV:  "insurance-holding",

  // ── Insurance — Life ──────────────────────────────────────────────────────
  SBILIFE:     "insurance-life",
  HDFCLIFE:    "insurance-life",
  ICICIPRULI:  "insurance-life",

  // ── NBFC / Lending ────────────────────────────────────────────────────────
  BAJFINANCE:  "nbfc",
  SHRIRAMFIN:  "nbfc",
  CHOLAFIN:    "nbfc",
  MUTHOOTFIN:  "nbfc",
  PFC:         "nbfc",
  RECLTD:      "nbfc",
  IRFC:        "nbfc",
  LICHSGFIN:   "nbfc",
  "M&MFIN":    "nbfc",
  PEL:         "nbfc",

  // ── Financial Services (AMC / Holding / Diversified) ──────────────────────
  JIOFIN:      "financial-services",
  BAJAJHLDNG:  "financial-services",
  HDFCAMC:     "financial-services",

  // ── IT Services ───────────────────────────────────────────────────────────
  TCS:         "it-services",
  INFY:        "it-services",
  HCLTECH:     "it-services",
  WIPRO:       "it-services",
  TECHM:       "it-services",

  // ── Pharma & Healthcare ───────────────────────────────────────────────────
  SUNPHARMA:   "pharma",
  CIPLA:       "pharma",
  DRREDDY:     "pharma",
  APOLLOHOSP:  "pharma",
  MAXHEALTH:   "pharma",
  DIVISLAB:    "pharma",
  TORNTPHARM:  "pharma",
  ZYDUSLIFE:   "pharma",

  // ── Auto & Ancillaries ────────────────────────────────────────────────────
  MARUTI:      "auto",
  "M&M":       "auto",
  "BAJAJ-AUTO":"auto",
  EICHERMOT:   "auto",
  TATAMOTORS:  "auto",
  TVSMOTOR:    "auto",
  CUMMINSIND:  "auto",
  HYUNDAI:     "auto",
  MOTHERSON:   "auto",
  BOSCHLTD:    "auto",
  ASHOKLEY:    "auto",

  // ── FMCG ──────────────────────────────────────────────────────────────────
  HINDUNILVR:  "fmcg",
  ITC:         "fmcg",
  NESTLEIND:   "fmcg",
  TATACONSUM:  "fmcg",
  BRITANNIA:   "fmcg",
  GODREJCP:    "fmcg",
  VBL:         "fmcg",
  UNITDSPR:    "fmcg",

  // ── Oil, Gas & Energy ─────────────────────────────────────────────────────
  RELIANCE:    "oil-gas-energy",
  ONGC:        "oil-gas-energy",
  COALINDIA:   "oil-gas-energy",
  IOC:         "oil-gas-energy",
  BPCL:        "oil-gas-energy",
  GAIL:        "oil-gas-energy",
  ADANIPOWER:  "oil-gas-energy",
  TATAPOWER:   "oil-gas-energy",
  ADANIENSOL:  "oil-gas-energy",
  ADANIGREEN:  "oil-gas-energy",

  // ── Metals & Mining ───────────────────────────────────────────────────────
  JSWSTEEL:    "metals-mining",
  TATASTEEL:   "metals-mining",
  HINDALCO:    "metals-mining",
  HINDZINC:    "metals-mining",
  VEDL:        "metals-mining",
  JINDALSTEL:  "metals-mining",

  // ── Power & Utilities ─────────────────────────────────────────────────────
  NTPC:        "power-utilities",
  POWERGRID:   "power-utilities",

  // ── Telecom ───────────────────────────────────────────────────────────────
  BHARTIARTL:  "telecom",

  // ── Cement & Building Materials ───────────────────────────────────────────
  ULTRACEMCO:  "cement-building",
  AMBUJACEM:   "cement-building",
  SHREECEM:    "cement-building",
  GRASIM:      "cement-building",
  PIDILITIND:  "cement-building",

  // ── Capital Goods & Infra ─────────────────────────────────────────────────
  LT:          "capital-goods-infra",
  ABB:         "capital-goods-infra",
  SIEMENS:     "capital-goods-infra",
  CGPOWER:     "capital-goods-infra",
  ADANIPORTS:  "capital-goods-infra",
  ADANIENT:    "capital-goods-infra",

  // ── Defence ───────────────────────────────────────────────────────────────
  BEL:         "defence",
  HAL:         "defence",
  MAZDOCK:     "defence",

  // ── Consumer & Retail ─────────────────────────────────────────────────────
  TITAN:       "consumer-retail",
  ETERNAL:     "consumer-retail",
  TRENT:       "consumer-retail",
  DMART:       "consumer-retail",
  ASIANPAINT:  "consumer-retail",
  INDHOTEL:    "consumer-retail",

  // ── Aviation ──────────────────────────────────────────────────────────────
  INDIGO:      "aviation",

  // ── Real Estate ───────────────────────────────────────────────────────────
  DLF:         "real-estate",
  LODHA:       "real-estate",
};
