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
