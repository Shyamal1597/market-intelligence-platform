"use client";

interface Row {
  symbol: string; name: string | null;
  turnoverFinancedPct: number | null; amtToday: number | null;
}

function fmtLakhs(v: number | null): string {
  if (v === null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

/**
 * MTF-financed amount is a cumulative outstanding book; today's turnover is
 * a single day's trading value -- so >100% is routine, not itself a signal.
 * Thresholds calibrated against real data (2026-07-15): p90 of the universe
 * is ~955%, p99 is ~3,756%. Elevated/severe only flag the genuine tail,
 * where the financed book is so far beyond what the stock can actually
 * trade in a day that an unwind would have nowhere to go.
 */
function crowdingClass(pct: number | null): string {
  if (pct == null) return "text-amber";
  if (pct >= 3000) return "text-danger font-bold";
  if (pct >= 1000) return "text-amber font-bold";
  return "text-amber";
}

export function TurnoverLeaderboard({
  rows, onSelectSymbol,
}: { rows: Row[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col h-[560px]">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-[9px] uppercase tracking-widest text-muted">
          MTF-Financed % of Today&rsquo;s Turnover
        </p>
        <p className="text-[9px] text-muted/60 mt-0.5">
          <span className="text-amber font-bold">Amber</span> (&ge;1000%) / <span className="text-danger font-bold">red</span> (&ge;3000%) =
          the financed book is 10-30x+ today&rsquo;s trading volume -- a forced unwind would have nowhere to go.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
              <th className="text-left font-normal px-2 py-1.5">Symbol</th>
              <th className="text-right font-normal px-2 py-1.5">% Turnover</th>
              <th className="text-right font-normal px-2 py-1.5">MTF Book</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                onClick={() => onSelectSymbol?.(r.symbol)}
                className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-2 py-1.5 text-primary">
                  {r.symbol}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${crowdingClass(r.turnoverFinancedPct)}`}>
                  {r.turnoverFinancedPct?.toFixed(1)}%
                </td>
                <td className="px-2 py-1.5 text-right text-muted tabular-nums">
                  {fmtLakhs(r.amtToday)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
