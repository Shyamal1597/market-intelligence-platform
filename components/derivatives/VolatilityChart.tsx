"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import type { DerivativesData } from "@/lib/nse-derivatives";

interface Props { data: DerivativesData; }

export function VolatilityChart({ data }: Props) {
  const chartData = data.chain
    .filter((r) => r.ceIV != null || r.peIV != null)
    .map((r) => ({
      strike: r.strikePrice,
      callIV: r.ceIV != null ? +r.ceIV.toFixed(2) : undefined,
      putIV: r.peIV != null ? +r.peIV.toFixed(2) : undefined,
    }));

  return (
    <div className="flex-1 p-4 min-h-0 flex flex-col">
      <p className="text-muted text-xs font-mono mb-3 tracking-wider uppercase">
        IV Skew — {data.symbol} · {data.expiry}
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" />
          <XAxis
            dataKey="strike"
            tickFormatter={(v: number) => v.toLocaleString("en-IN")}
            tick={{ fill: "#7A8099", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "#7A8099", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: "#13151E",
              border: "1px solid #1E2235",
              borderRadius: 8,
              fontFamily: "JetBrains Mono",
              fontSize: 11,
            }}
            labelStyle={{ color: "#F0EDE8" }}
            formatter={(v: number | undefined, name: string | undefined) => [
              v != null ? `${v}%` : "–",
              name === "callIV" ? "Call IV" : "Put IV",
            ]}
            labelFormatter={(v) => `Strike: ${Number(v).toLocaleString("en-IN")}`}
          />
          <Legend
            formatter={(v) => (v === "callIV" ? "Call IV" : "Put IV")}
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
          />
          <ReferenceLine
            x={data.atmStrike}
            stroke="#F5820D"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: "ATM", fill: "#F5820D", fontSize: 10, fontFamily: "JetBrains Mono" }}
          />
          <Line type="monotone" dataKey="callIV" stroke="#38BDF8" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="putIV" stroke="#F87171" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
