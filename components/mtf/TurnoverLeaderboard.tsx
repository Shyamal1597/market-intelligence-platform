"use client";

interface Row {
  symbol: string; name: string | null;
  turnoverFinancedPct: number | null; amtToday: number | null;
}

function fmtLakhs(v: number | null): string {
  if (v === null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

export function TurnoverLeaderboard({
  rows, onSelectSymbol,
}: { rows: Row[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col h-[560px]">
      <p className="text-[9px] uppercase tracking-widest text-muted px-3 pt-3 pb-2 shrink-0">
        MTF-Financed % of Today&rsquo;s Turnover
      </p>
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
                <td className="px-2 py-1.5 text-right text-amber tabular-nums">
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
