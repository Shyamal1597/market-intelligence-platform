"use client";

export interface DivergenceRow {
  symbol: string;
  name: string | null;
  amtChangePct: number;
  priceChangePct: number;
  amtToday: number | null;
  pattern: "leverage-up-price-down" | "leverage-down-price-up";
}

export function DivergencePanel({
  rows, onSelectSymbol,
}: { rows: DivergenceRow[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <p className="text-[9px] uppercase tracking-widest text-muted">
          Leverage vs Price Divergence
        </p>
        <p className="text-[9px] text-muted/60 mt-0.5 max-w-3xl">
          Stocks where margin financing and price moved in opposite directions today. Leverage up / price down =
          margin being added against a falling stock (unwind risk grows if it keeps falling). Leverage down /
          price up = margin being pulled out of a rising stock.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 text-[11px] text-muted font-mono">No notable divergences today.</p>
      ) : (
        <div className="overflow-y-auto max-h-[280px]">
          <table className="w-full text-[11px] font-mono border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
                <th className="text-left font-normal px-3 py-1.5">Symbol</th>
                <th className="text-right font-normal px-2 py-1.5">MTF Chg %</th>
                <th className="text-right font-normal px-2 py-1.5">Price Chg %</th>
                <th className="text-left font-normal px-2 py-1.5">Pattern</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onSelectSymbol?.(r.symbol)}
                  className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <td className="px-3 py-1.5 text-primary">{r.symbol}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.amtChangePct >= 0 ? "text-teal" : "text-danger"}`}>
                    {r.amtChangePct >= 0 ? "+" : ""}{r.amtChangePct.toFixed(2)}%
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.priceChangePct >= 0 ? "text-teal" : "text-danger"}`}>
                    {r.priceChangePct >= 0 ? "+" : ""}{r.priceChangePct.toFixed(2)}%
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-muted">
                    {r.pattern === "leverage-up-price-down" ? "Leverage up, price down" : "Leverage down, price up"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
