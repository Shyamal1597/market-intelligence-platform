/**
 * targetResolver — converts free-text management guidance target expressions
 * into canonical quarter labels ("Q3-FY27") relative to a source quarter.
 *
 * Handles patterns found in Indian earnings concalls:
 *   "next quarter"              → sourceQuarter + 1
 *   "this quarter" / "current"  → sourceQuarter
 *   "Q3-FY27" / "Q3 FY27"      → literal parse
 *   "FY27" / "full year FY27"   → Q4-FY27 (management speaks at end of year)
 *   "H1 FY27"                   → Q2-FY27 (end of first half)
 *   "H2 FY27"                   → Q4-FY27 (end of second half)
 *   "exit rate by FY27"         → Q4-FY27
 *   "2–3 quarters"              → sourceQuarter + 2 (midpoint, rounded down)
 *   "near term" / "short term"  → sourceQuarter + 1
 *   "medium term"               → sourceQuarter + 4 (~1 year)
 *   null / "" / unrecognised    → null
 */
import { normalizeQuarter, quarterAddOffset } from "./quarters";
import type { Quarter } from "./quarters";

export interface ResolveResult {
  quarter: Quarter | null;
  /** How confident the resolver is in the mapping (for UI display). */
  confidence: "exact" | "inferred" | "approximate";
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fyFromText(text: string): number | null {
  const m = text.match(/FY\s*(\d{2,4})/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  return n > 100 ? n % 100 : n; // collapse 4-digit to 2-digit
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Resolve a management guidance target expression to a canonical quarter label.
 *
 * @param targetText  Free-text from the transcript, e.g. "by Q3 of FY27"
 * @param sourceQuarter  The quarter when the call took place, e.g. "Q2-FY26"
 */
export function resolveTargetQuarter(
  targetText: string | null | undefined,
  sourceQuarter: Quarter,
): ResolveResult {
  const null_result: ResolveResult = { quarter: null, confidence: "approximate" };
  if (!targetText) return null_result;

  const t = targetText.trim().toLowerCase();

  // ── 1. Exact canonical Q label already in the text ────────────────────────
  // "Q3-FY27", "Q3 FY27", "Q3FY27", "Q3 of FY27"
  const exactMatch = targetText.match(/Q\s*([1-4])[\s-]*(?:of\s+)?FY\s*(\d{2,4})/i);
  if (exactMatch) {
    const q = parseInt(exactMatch[1]);
    const fyRaw = parseInt(exactMatch[2]);
    const fy = fyRaw > 100 ? fyRaw % 100 : fyRaw;
    const label = `Q${q}-FY${String(fy).padStart(2, "0")}` as Quarter;
    return { quarter: label, confidence: "exact" };
  }

  // ── 2. "this quarter" / "current quarter" ────────────────────────────────
  if (/\b(this|current)\s+quarter\b/.test(t)) {
    return { quarter: sourceQuarter, confidence: "exact" };
  }

  // ── 3. "next quarter" / "following quarter" ───────────────────────────────
  if (/\bnext\s+quarter\b|\bfollowing\s+quarter\b/.test(t)) {
    return { quarter: quarterAddOffset(sourceQuarter, 1), confidence: "exact" };
  }

  // ── 4. Half-year: "H1 FY27", "first half FY27", "H2 FY27", "second half FY27"
  const halfMatch = t.match(/\b(h1|h2|first\s+half|second\s+half)\b.*?fy\s*(\d{2,4})/i);
  if (halfMatch) {
    const fy = fyFromText(t);
    if (fy !== null) {
      const isH1 = /\b(h1|first\s+half)\b/.test(t);
      const endQ = isH1 ? 2 : 4;  // H1 ends Q2, H2 ends Q4
      const label = `Q${endQ}-FY${String(fy).padStart(2, "0")}` as Quarter;
      return { quarter: label, confidence: "inferred" };
    }
  }

  // ── 5. Full fiscal year: "FY27", "full year FY27", "end of FY27", "by FY27"
  //    Treat as Q4 of that FY (last quarter of the year)
  if (/\bfy\s*\d{2,4}\b/i.test(t) && !/\bq[1-4]\b/i.test(t) && !/\bh[12]\b/i.test(t)) {
    const fy = fyFromText(t);
    if (fy !== null) {
      const label = `Q4-FY${String(fy).padStart(2, "0")}` as Quarter;
      return { quarter: label, confidence: "inferred" };
    }
  }

  // ── 6. "exit rate by <period>" — treat same as FY/Q reference above (already caught)

  // ── 7. "2–3 quarters" / "two quarters" / "a couple of quarters" ──────────
  const rangeMatch = t.match(/(\d+)[\s–-]+(\d+)\s+quarters?/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1]);
    const hi = parseInt(rangeMatch[2]);
    const mid = Math.floor((lo + hi) / 2);
    return { quarter: quarterAddOffset(sourceQuarter, mid), confidence: "approximate" };
  }
  const singleQMatch = t.match(/\bin\s+(\d+)\s+quarters?\b/);
  if (singleQMatch) {
    return { quarter: quarterAddOffset(sourceQuarter, parseInt(singleQMatch[1])), confidence: "approximate" };
  }

  // ── 8. "two / three / four quarters" (word form) ─────────────────────────
  const wordNums: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  for (const [word, n] of Object.entries(wordNums)) {
    if (new RegExp(`\\bin\\s+${word}\\s+quarters?\\b`).test(t)) {
      return { quarter: quarterAddOffset(sourceQuarter, n), confidence: "approximate" };
    }
  }

  // ── 9. "near term" / "short term" → +1 quarter ───────────────────────────
  if (/\b(near[- ]?term|short[- ]?term)\b/.test(t)) {
    return { quarter: quarterAddOffset(sourceQuarter, 1), confidence: "approximate" };
  }

  // ── 10. "medium term" → +4 quarters (~1 year) ────────────────────────────
  if (/\bmedium[- ]?term\b/.test(t)) {
    return { quarter: quarterAddOffset(sourceQuarter, 4), confidence: "approximate" };
  }

  // ── 11. "over the next year" / "12 months" → +4 quarters ─────────────────
  if (/\bnext\s+(1|one)\s+year\b|\b(over\s+the\s+next\s+year|next\s+12\s+months)\b/.test(t)) {
    return { quarter: quarterAddOffset(sourceQuarter, 4), confidence: "approximate" };
  }

  return null_result;
}

/**
 * Attempt to resolve the targetQuarter field of an extracted claim.
 * If the claim already has a canonical label (validated by normalizeQuarter),
 * accept it; otherwise fall back to resolving targetText.
 *
 * Special case: if the LLM set targetQuarter to the same quarter as sourceQuarter,
 * don't trust it — fall through to targetText resolution. This handles a common
 * LLM error where historical current-period statements get targetQuarter = sourceQuarter
 * even though targetText says "next quarter".
 */
export function resolveClaimTarget(
  targetQuarter: string | null | undefined,
  targetText: string | null | undefined,
  sourceQuarter: Quarter,
): ResolveResult {
  if (targetQuarter) {
    const norm = normalizeQuarter(targetQuarter);
    // Only honour the explicit label when it refers to a DIFFERENT quarter than source.
    // If it equals source, defer to targetText (which may say "next quarter" etc.).
    if (norm && norm !== sourceQuarter) return { quarter: norm, confidence: "exact" };
  }
  return resolveTargetQuarter(targetText ?? null, sourceQuarter);
}
