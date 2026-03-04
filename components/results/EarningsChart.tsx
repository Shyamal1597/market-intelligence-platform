"use client";

import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import type { WatchlistEntry } from "@/lib/watchlist";
import type { EarningsData } from "@/lib/earnings";

type Metric = "netIncome" | "totalRevenue" | "ebit" | "basicEps";

const METRIC_LABELS: Record<Metric, string> = {
  netIncome: "PAT",
  totalRevenue: "Revenue",
  ebit: "EBIT",
  basicEps: "EPS",
};

interface ChartRow {
  quarter: string;
  value: number | undefined;
  yoy: number | undefined;
}

function buildChartData(
  quarters: EarningsData["quarters"],
  metric: Metric
): ChartRow[] {
  return quarters.map((q, i) => {
    // basicEps is number | null; other metrics are number — normalise to number | undefined
    const cur: number | undefined =
      q[metric] !== null ? (q[metric] as number) : undefined;
    const prevRaw = i > 0 ? quarters[i - 1][metric] : null;
    const prev: number | undefined =
      prevRaw !== null && prevRaw !== undefined ? (prevRaw as number) : undefined;
    const yoy: number | undefined =
      cur !== undefined && prev !== undefined && prev !== 0
        ? ((cur - prev) / Math.abs(prev)) * 100
        : undefined;
    return { quarter: q.quarterLabel, value: cur, yoy };
  });
}

interface Props {
  stock: WatchlistEntry;
  earnings: EarningsData;
  onRefresh?: () => void;
}

export function EarningsChart({ stock, earnings, onRefresh }: Props) {
  const [metric, setMetric] = useState<Metric>("netIncome");
  const chartData = buildChartData(earnings.quarters, metric);
  const isEps = metric === "basicEps";
  const unit = isEps ? "&#8377;" : "&#8377;Cr";

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary leading-tight">
            {stock.name}
          </h2>
          <p className="text-xs font-mono text-muted mt-0.5">
            {stock.symbol}{stock.sector && ` \u00b7 ${stock.sector}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stock.rating && (
            <span className="text-xs font-mono px-2 py-1 rounded border border-amber/30 text-amber">
              {stock.rating}
              {stock.targetPrice != null && ` \u00b7 TP \u20b9${stock.targetPrice}`}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 text-muted hover:text-primary hover:bg-white/5 rounded transition-colors"
              title="Force refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metric toggle */}
      <div className="flex gap-1">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={clsx(
              "px-3 py-1 text-[11px] font-mono rounded transition-colors",
              metric === m
                ? "bg-amber text-background font-medium"
                : "bg-border text-muted hover:text-primary"
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 48, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="quarter"
              tick={{ fill: "#7A8099", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="bar"
              tick={{ fill: "#7A8099", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                isEps ? `\u20b9${v}` : `${v.toLocaleString("en-IN")}`
              }
            />
            <YAxis
              yAxisId="line"
              orientation="right"
              tick={{ fill: "#7A8099", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                fontFamily: "JetBrains Mono",
                fontSize: 12,
                borderRadius: 8,
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                name === "yoy"
                  ? `${value != null ? value.toFixed(1) : "\u2014"}%`
                  : `${isEps ? "\u20b9" : "\u20b9Cr"}${value != null ? value.toLocaleString("en-IN") : "\u2014"}`,
                name === "yoy" ? "QoQ \u0394" : METRIC_LABELS[metric],
              ]}
            />
            <ReferenceLine yAxisId="line" y={0} stroke="var(--color-border-strong, #2A2E45)" strokeDasharray="4 4" />
            <Bar
              yAxisId="bar"
              dataKey="value"
              fill="#F5820D"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="line"
              type="monotone"
              dataKey="yoy"
              stroke="#00C9A7"
              dot={{ fill: "#00C9A7", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              strokeWidth={2}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] font-mono text-muted">
        Yahoo Finance &middot; {earnings.quarters.length} quarters &middot; refreshed{" "}
        {new Date(earnings.fetchedAt).toLocaleString("en-IN", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}
