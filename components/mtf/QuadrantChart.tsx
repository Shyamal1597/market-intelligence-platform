"use client";

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer, Cell, Label } from "recharts";

interface Point { symbol: string; priceChangePct: number; amtChangePct: number; isCoverage: boolean; }

function quadrantLabel(p: Point): string {
  if (p.priceChangePct >= 0 && p.amtChangePct >= 0) return "Leveraged rally -- price and margin funding both rising";
  if (p.priceChangePct < 0 && p.amtChangePct >= 0) return "Contrarian buying -- margin funding rising despite falling price";
  if (p.priceChangePct >= 0 && p.amtChangePct < 0) return "Organic rally -- price rising without added leverage";
  return "Capitulation -- price and margin funding both falling";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded px-2.5 py-2 text-[11px] font-mono text-[#F0EDE8] max-w-[220px]">
      <p className="font-bold mb-1">{p.symbol}</p>
      <p>Price change: {p.priceChangePct >= 0 ? "+" : ""}{p.priceChangePct.toFixed(2)}%</p>
      <p>MTF-financed change: {p.amtChangePct >= 0 ? "+" : ""}{p.amtChangePct.toFixed(2)}%</p>
      <p className="mt-1 pt-1 border-t border-[#1E2235] text-[#6E7590] leading-snug">{quadrantLabel(p)}</p>
    </div>
  );
}

export function QuadrantChart({
  points, onSelectSymbol,
}: { points: Point[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 h-[560px] flex flex-col">
      <div className="shrink-0 mb-1">
        <p className="text-[9px] uppercase tracking-widest text-muted">
          Price vs. Leverage Change (today)
        </p>
        <p className="text-[9px] text-muted/60 mt-0.5">
          Each dot is one stock -- how much its price moved vs. how much its margin-financed amount moved, both day-over-day.
          Financed amount below ₹1 Cr excluded (too small to be a meaningful % move).
        </p>
      </div>

      <div className="flex-1 min-h-0 relative">
        {/* Quadrant corner labels -- indicative positioning, not axis-anchored to exact 0,0 pixel */}
        <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2 text-[8px] uppercase tracking-wider text-muted/50 p-1">
          <div className="flex items-start justify-start">↖ Contrarian buying</div>
          <div className="flex items-start justify-end text-right">Leveraged rally ↗</div>
          <div className="flex items-end justify-start">Capitulation ↙</div>
          <div className="flex items-end justify-end text-right">↘ Organic rally</div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 28 }}>
            <CartesianGrid stroke="#1E2235" />
            <XAxis type="number" dataKey="priceChangePct" tick={{ fill: "#6E7590", fontSize: 10 }}>
              <Label value="Price Change (%)" position="bottom" offset={0} style={{ fill: "#6E7590", fontSize: 10 }} />
            </XAxis>
            <YAxis type="number" dataKey="amtChangePct" tick={{ fill: "#6E7590", fontSize: 10 }}>
              <Label value="MTF-Financed Change (%)" angle={-90} position="left" offset={10} style={{ fill: "#6E7590", fontSize: 10, textAnchor: "middle" }} />
            </YAxis>
            <ReferenceLine x={0} stroke="#1E2235" />
            <ReferenceLine y={0} stroke="#1E2235" />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              data={points}
              onClick={(p: any) => onSelectSymbol?.(p.symbol)}
              style={{ cursor: onSelectSymbol ? "pointer" : "default" }}
            >
              {points.map((p, i) => (
                <Cell key={i} fill={p.isCoverage ? "#F5820D" : "#6E7590"} fillOpacity={p.isCoverage ? 0.9 : 0.35} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="shrink-0 mt-1 flex items-center gap-3 text-[9px] text-muted/70">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#F5820D" }} /> Coverage stock</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block opacity-40" style={{ background: "#6E7590" }} /> Other</span>
      </div>
    </div>
  );
}
