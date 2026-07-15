"use client";

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Point { symbol: string; priceChangePct: number; amtChangePct: number; isCoverage: boolean; }

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded px-2 py-1.5 text-[11px] font-mono text-[#F0EDE8]">
      <p className="font-bold">{p.symbol}</p>
      <p>Price: {p.priceChangePct.toFixed(2)}%</p>
      <p>MTF: {p.amtChangePct.toFixed(2)}%</p>
    </div>
  );
}

export function QuadrantChart({
  points, onSelectSymbol,
}: { points: Point[]; onSelectSymbol?: (symbol: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 h-[560px] flex flex-col">
      <p className="text-[9px] uppercase tracking-widest text-muted mb-2 shrink-0">
        Price vs. Leverage Change (today)
      </p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="#1E2235" />
            <XAxis type="number" dataKey="priceChangePct" name="Price % Chg" tick={{ fill: "#6E7590", fontSize: 10 }} />
            <YAxis type="number" dataKey="amtChangePct" name="MTF % Chg" tick={{ fill: "#6E7590", fontSize: 10 }} />
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
    </div>
  );
}
