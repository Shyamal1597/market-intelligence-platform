/**
 * Shared display formatter for MTF-financed amounts. The database and API
 * store/return everything in Lakhs (matching the source Excel's own "Amt
 * Fin ... (Rs. In Lakhs)" column) -- this only converts for display.
 * 1 Crore = 100 Lakhs.
 */
export function fmtCr(lakhs: number | null | undefined): string {
  if (lakhs == null) return "—";
  const cr = lakhs / 100;
  return `₹${cr.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
}

/**
 * Length of the report's own "MTF DATA POSITIVE"/"MTF DATA NEGATIVE"
 * lookback window, in trading days -- confirmed against the raw source
 * (2026-08-03 file: 21 date columns = 20 day-over-day comparisons). Changed
 * from 5 days per the source vendor's own update. Lives here (not
 * lib/mtf/queries.ts, which imports better-sqlite3 and can't be pulled into
 * client components) so both server query logic and client UI labels
 * ("X / 20") derive from one place instead of hardcoding the day count
 * per-component.
 */
export const MOVER_WINDOW_DAYS = 20;
