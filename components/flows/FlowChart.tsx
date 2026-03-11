"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label,
} from "recharts";
import type { FiiDiiEntry } from "@/lib/nse-flows";

type Entity = "fii" | "dii" | "both";

interface FlowChartProps {
  entries: FiiDiiEntry[];
}

function ToggleBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
        active
          ? "bg-amber/20 text-amber border border-amber/30"
          : "text-muted border border-[#1E2235] hover:text-primary hover:border-[#2E3250]"
      }`}
    >
      {label}
    </button>
  );
}

interface TooltipPayloadItem {
  name: string;
  value: number | null;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  // Format date nicely
  const dateStr = label
    ? new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : label;

  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded-lg p-3 text-xs font-mono shadow-xl min-w-[180px]">
      <p className="text-primary mb-2 font-semibold">{dateStr}</p>
      {payload.map((p) =>
        p.value !== null && p.value !== undefined ? (
          <div key={p.name} className="flex justify-between gap-4 leading-5">
            <span style={{ color: p.color }}>{p.name}</span>
            <span style={{ color: p.color }}>
              {p.value >= 0 ? "+" : ""}₹{Math.round(p.value).toLocaleString("en-IN")} Cr
            </span>
          </div>
        ) : null
      )}
    </div>
  );
}

function crLabel(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

export function FlowChart({ entries }: FlowChartProps) {  // nifty overlay removed — scaled overlay was misleading
  const [entity, setEntity] = useState<Entity>("fii");

  const chartData = useMemo(() => {
    return entries.map((e) => ({
      date: e.date,
      fiiNet:    e.fiiEquityNet,
      diiNet:    e.diiEquityNet,
      cumulFii:  e.cumulativeFiiEquityNet  ?? null,
      cumulDii:  e.cumulativeDiiEquityNet  ?? null,
      rollingFii: e.rollingAvg20FiiEquity  ?? null,
      rollingDii: e.rollingAvg20DiiEquity  ?? null,
    }));
  }, [entries]);

  // Adaptive ticks: daily labels when < 45 days of data, weekly when < 6 months, monthly otherwise
  const { ticks: xTicks, tickFormat } = useMemo(() => {
    if (chartData.length === 0) return { ticks: [], tickFormat: "month" as const };

    const spanDays =
      (new Date(chartData[chartData.length - 1].date).getTime() -
        new Date(chartData[0].date).getTime()) /
      86_400_000;

    if (spanDays <= 45) {
      // Show every data point
      return {
        ticks: chartData.map((d) => d.date),
        tickFormat: "day" as const,
      };
    }

    if (spanDays <= 180) {
      // Weekly — first date of each ISO week
      const seen = new Set<string>();
      return {
        ticks: chartData
          .filter((d) => {
            const dt = new Date(d.date);
            const week = `${dt.getFullYear()}-W${Math.ceil(dt.getDate() / 7)}`;
            if (seen.has(week)) return false;
            seen.add(week);
            return true;
          })
          .map((d) => d.date),
        tickFormat: "week" as const,
      };
    }

    // Monthly
    const seen = new Set<string>();
    return {
      ticks: chartData
        .filter((d) => {
          const month = d.date.slice(0, 7);
          if (seen.has(month)) return false;
          seen.add(month);
          return true;
        })
        .map((d) => d.date),
      tickFormat: "month" as const,
    };
  }, [chartData]);

  function formatXTick(v: string): string {
    const dt = new Date(v);
    if (tickFormat === "day")
      return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (tickFormat === "week")
      return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }

  const showFii = entity === "fii" || entity === "both";
  const showDii = entity === "dii" || entity === "both";
  const showLines = entity !== "both";

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
            Equity Flows · Daily net + {showLines ? "cumulative & 20D avg" : "FII vs DII"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <ToggleBtn label="FII" active={entity === "fii"} onClick={() => setEntity("fii")} />
          <ToggleBtn label="DII" active={entity === "dii"} onClick={() => setEntity("dii")} />
          <ToggleBtn label="FII vs DII" active={entity === "both"} onClick={() => setEntity("both")} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 flex-wrap">
        {showFii && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="w-3 h-2 rounded-sm bg-teal/80 inline-block" />
            {entity === "both" ? "FII" : ""} Daily net (+)
          </span>
        )}
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="w-3 h-2 rounded-sm bg-danger/80 inline-block" />
          Daily net (−)
        </span>
        {showDii && entity === "both" && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="w-3 h-2 rounded-sm bg-teal/40 inline-block" />
            DII Daily net (+)
          </span>
        )}
        {showLines && (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="inline-block w-5" style={{ height: 2, background: "#F5820D" }} />
              Cumulative (right axis)
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="inline-block w-5" style={{ height: 1.5, background: "rgba(240,237,232,0.5)", borderTop: "1.5px dashed rgba(240,237,232,0.5)" }} />
              20D moving avg
            </span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 60, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="date"
            ticks={xTicks}
            tickFormatter={formatXTick}
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
          />

          {/* Left Y: daily bars + 20D avg */}
          <YAxis
            yAxisId="left"
            tickFormatter={crLabel}
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            width={48}
          >
            <Label
              value="₹ Cr (daily)"
              angle={-90}
              position="insideLeft"
              offset={14}
              style={{ fontSize: 9, fill: "#4B5563", fontFamily: "JetBrains Mono, monospace" }}
            />
          </YAxis>

          {/* Right Y: cumulative — only rendered when single entity selected */}
          {showLines && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={crLabel}
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#F5820D" }}
              axisLine={false}
              tickLine={false}
              width={52}
            >
              <Label
                value="Cumulative ₹ Cr"
                angle={90}
                position="insideRight"
                offset={16}
                style={{ fontSize: 9, fill: "#F5820D", fontFamily: "JetBrains Mono, monospace" }}
              />
            </YAxis>
          )}

          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="left" y={0} stroke="#2A2F47" strokeWidth={1} />

          {/* FII daily bars */}
          {showFii && (
            <Bar
              yAxisId="left"
              dataKey="fiiNet"
              name={entity === "both" ? "FII Daily" : "Daily Net"}
              isAnimationActive={false}
              maxBarSize={entity === "both" ? 5 : 8}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={(d.fiiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"}
                  opacity={entity === "both" ? 0.9 : 1}
                />
              ))}
            </Bar>
          )}

          {/* DII daily bars (only in both mode) */}
          {showDii && entity === "both" && (
            <Bar
              yAxisId="left"
              dataKey="diiNet"
              name="DII Daily"
              isAnimationActive={false}
              maxBarSize={5}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={(d.diiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"}
                  opacity={0.45}
                />
              ))}
            </Bar>
          )}

          {/* Cumulative line — right axis */}
          {showLines && (
            <Line
              yAxisId="right"
              dataKey={entity === "fii" ? "cumulFii" : "cumulDii"}
              name="Cumulative"
              stroke="#F5820D"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* 20-day rolling average — left axis */}
          {showLines && (
            <Line
              yAxisId="left"
              dataKey={entity === "fii" ? "rollingFii" : "rollingDii"}
              name="20D Avg"
              stroke="rgba(240,237,232,0.55)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
              strokeDasharray="4 2"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
