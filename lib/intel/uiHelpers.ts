/**
 * UI formatting helpers for the Intel Dashboard.
 * Pure functions — no React deps — safe to import in both server and client contexts.
 */
import type { Verdict } from "./types";

// ── Verdict display ───────────────────────────────────────────────────────────

export const VERDICT_LABEL: Record<Verdict, string> = {
  met:       "Met",
  moving:    "Moving",
  miss:      "Miss",
  pending:   "Pending",
  ambiguous: "Ambiguous",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  met:       "text-teal",
  moving:    "text-amber",
  miss:      "text-danger",
  pending:   "text-muted",
  ambiguous: "text-muted",
};

/** Compute on-track percentage string: (met + moving) / decisive. */
export function onTrackDisplay(met: number, moving: number, decisive: number): string {
  if (decisive === 0) return "—";
  return `${Math.round(((met + moving) / decisive) * 100)}%`;
}

// ── Value formatting ──────────────────────────────────────────────────────────

export function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "Cr") {
    if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)}L Cr`;
    if (value >= 1_000)   return `₹${(value / 1_000).toFixed(2)}K Cr`;
    return `₹${value.toFixed(2)} Cr`;
  }
  if (unit === "bps") return `${value.toFixed(0)} bps`;
  if (unit === "x")   return `${value.toFixed(2)}x`;
  return `${value}`;
}

/** Short delta string: "+20 bps", "-₹150 Cr", "+12%" */
export function deltaDisplay(actual: number, guided: number, unit: string): string {
  const diff = actual - guided;
  const sign = diff > 0 ? "+" : "";
  if (unit === "%")   return `${sign}${diff.toFixed(2)}%`;
  if (unit === "bps") return `${sign}${diff.toFixed(0)} bps`;
  if (unit === "Cr")  return `${sign}₹${diff.toFixed(2)} Cr`;
  return `${sign}${diff.toFixed(2)}`;
}

// ── Quarter helpers ───────────────────────────────────────────────────────────

/** "Q3-FY26" → "Q3 FY26" for display */
export function quarterDisplay(q: string): string {
  return q.replace("-", " ");
}

/** Sort quarter labels chronologically. */
export function sortQuarters(quarters: string[]): string[] {
  return [...quarters].sort((a, b) => {
    // Parse Q{n}-FY{yy} → a[1] = quarter digit, a.slice(5) = year digits
    const [aq, afy] = [parseInt(a[1]), parseInt(a.slice(5))];
    const [bq, bfy] = [parseInt(b[1]), parseInt(b.slice(5))];
    return afy !== bfy ? afy - bfy : aq - bq;
  });
}

// ── Quote helpers ─────────────────────────────────────────────────────────────

/**
 * Return a readable quote snippet that ends at a sentence boundary.
 * Cuts at the last `.` / `!` / `?` before maxLen so the reader gets a
 * complete thought rather than an abruptly truncated fragment.
 */
export function snippetQuote(quote: string, maxLen = 320): string {
  if (quote.length <= maxLen) return quote;

  const window = quote.slice(0, maxLen);

  const lastEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
  );

  if (lastEnd > maxLen * 0.45) {
    return window.slice(0, lastEnd + 1).trimEnd();
  }

  const lastSpace = window.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? window.slice(0, lastSpace) : window) + "…";
}
