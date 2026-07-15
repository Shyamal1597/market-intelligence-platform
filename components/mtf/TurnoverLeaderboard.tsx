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
 * Shown as a MULTIPLE of today's turnover ("192x"), not a percentage
 * ("19190%") -- the raw percentage is mathematically correct but unreadable
 * at a glance (a five-digit number reads as broken even when it isn't).
 * "192x" reads immediately as "192 days of today's volume to unwind."
 * MTF-financed amount is a cumulative outstanding book; today's turnover is
 * a single day's trading value -- so >1x is routine, not itself a signal.
 * Thresholds calibrated against real data (2026-07-15): p90 of the universe
 * is ~9.6x, p99 is ~37.6x. Elevated/severe only flag the genuine tail,
 * where the financed book is so far beyond what the stock can actually
 * trade in a day that an unwind would have nowhere to go.
 */
function turnoverMultiple(pct: number | null): number | null {
  return pct == null ? null : pct / 100;
}

function crowdingClass(multiple: number | null): string {
  if (multiple == null) return "text-amber";
  if (multiple >= 30) return "text-danger font-bold";
  if (multiple >= 10) return "text-amber font-bold";
  return "text-amber";
}

export function TurnoverLeaderboard({
  rows, onSelectSymbol,
}: { rows: Row[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col h-[560px]">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-[9px] uppercase tracking-widest text-muted">
          MTF Book vs Today&rsquo;s Turnover
        </p>
        <p className="text-[9px] text-muted/60 mt-0.5">
          &ldquo;12x&rdquo; = the money currently financed on margin is 12 times today&rsquo;s traded value for that
          stock -- i.e. it would take ~12 days of today&rsquo;s volume to unwind the full financed position.
          <span className="text-amber font-bold"> Amber</span> (&ge;10x) / <span className="text-danger font-bold">red</span> (&ge;30x)
          flag stocks where that unwind would have nowhere to go.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
              <th className="text-left font-normal px-2 py-1.5">Symbol</th>
              <th className="text-right font-normal px-2 py-1.5">Book / Turnover</th>
              <th className="text-right font-normal px-2 py-1.5">MTF Book</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const multiple = turnoverMultiple(r.turnoverFinancedPct);
              return (
                <tr
                  key={r.symbol}
                  onClick={() => onSelectSymbol?.(r.symbol)}
                  className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <td className="px-2 py-1.5 text-primary">
                    {r.symbol}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${crowdingClass(multiple)}`}>
                    {multiple != null ? `${multiple.toFixed(1)}x` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted tabular-nums">
                    {fmtLakhs(r.amtToday)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
