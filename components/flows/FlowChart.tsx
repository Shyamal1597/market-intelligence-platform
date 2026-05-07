"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart, AreaChart, Bar, Line, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from "recharts";
import type { FiiDiiEntry } from "@/lib/nse-flows";

type Entity = "fii" | "dii" | "both";

interface FlowChartProps {
  entries: FiiDiiEntry[];
}

function ToggleBtn({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
        active
          ? "bg-amber/20 text-amber border border-amber/30"
          : "text-muted border border-border hover:text-primary"
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

function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const dateStr = label
    ? new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : label;
  return (
    <div
      className="rounded-lg p-3 text-xs font-mono shadow-xl min-w-[180px] border border-border"
      style={{ background: "var(--color-surface)" }}
    >
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
  if (Math.abs(v) >= 100000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

const TEAL   = "#00C9A7";
const DANGER = "#E84040";
const AMBER  = "#F5820D";
const MUTED  = "rgba(240,237,232,0.55)";

export function FlowChart({ entries }: FlowChartProps) {
  const [entity, setEntity] = useState<Entity>("fii");

  const chartData = useMemo(() => entries.map((e) => ({
    date:        e.date,
    fiiNet:      e.fiiEquityNet,
    diiNet:      e.diiEquityNet,
    cumulFii:    e.cumulativeFiiEquityNet ?? null,
    cumulDii:    e.cumulativeDiiEquityNet ?? null,
    rollingFii:  e.rollingAvg20FiiEquity ?? null,
    rollingDii:  e.rollingAvg20DiiEquity ?? null,
  })), [entries]);

  // Adaptive ticks: evenly-spaced indices into chartData, guaranteeing the
  // last data point is always a tick (no blank space on the right edge).
  // Format flips to "Mon YY" only for very long spans (>10 months).
  const { ticks: xTicks, tickFormat } = useMemo(() => {
    if (chartData.length === 0) return { ticks: [] as string[], tickFormat: "day" as const };

    const spanDays =
      (new Date(chartData[chartData.length - 1].date).getTime() -
        new Date(chartData[0].date).getTime()) / 86_400_000;
    const tickFormat: "day" | "month" = spanDays > 300 ? "month" : "day";

    const TARGET = 8;
    if (chartData.length <= TARGET) {
      return { ticks: chartData.map((d) => d.date), tickFormat };
    }

    const step = (chartData.length - 1) / (TARGET - 1);
    const ticks: string[] = [];
    for (let i = 0; i < TARGET; i++) {
      ticks.push(chartData[Math.round(i * step)].date);
    }
    // Defensive: ensure last data point is a tick even if rounding skipped it
    const lastDate = chartData[chartData.length - 1].date;
    if (ticks[ticks.length - 1] !== lastDate) ticks.push(lastDate);
    return { ticks, tickFormat };
  }, [chartData]);

  function formatXTick(v: string): string {
    const dt = new Date(v);
    if (tickFormat === "month")
      return dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const isCompare = entity === "both";
  const dailyKey   = entity === "dii" ? "diiNet"     : "fiiNet";
  const cumulKey   = entity === "dii" ? "cumulDii"   : "cumulFii";
  const rollingKey = entity === "dii" ? "rollingDii" : "rollingFii";
  const entityLabel = entity === "dii" ? "DII" : "FII";

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-xs font-mono text-muted uppercase tracking-widest">
          Equity Flows · {isCompare ? "FII vs DII" : `${entityLabel} daily + cumulative`}
        </p>
        <div className="flex gap-1.5">
          <ToggleBtn label="FII"        active={entity === "fii"}  onClick={() => setEntity("fii")} />
          <ToggleBtn label="DII"        active={entity === "dii"}  onClick={() => setEntity("dii")} />
          <ToggleBtn label="FII vs DII" active={entity === "both"} onClick={() => setEntity("both")} />
        </div>
      </div>

      {/* ── Chart 1: Daily net ─────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-5 flex-wrap">
        <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
          {isCompare ? "Daily Net · FII vs DII" : `Daily Net · ${entityLabel}`}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="w-3 h-2 rounded-sm inline-block" style={{ background: TEAL }} />
          Net buy
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="w-3 h-2 rounded-sm inline-block" style={{ background: DANGER }} />
          Net sell
        </span>
        {!isCompare && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="inline-block w-5 border-t-[1.5px] border-dashed" style={{ borderColor: MUTED }} />
            20D avg
          </span>
        )}
        {isCompare && (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: TEAL, opacity: 0.9 }} />
              FII
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: TEAL, opacity: 0.45 }} />
              DII
            </span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={isCompare ? 380 : 260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="date"
            ticks={xTicks}
            tickFormatter={formatXTick}
            tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "var(--color-muted)" }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={crLabel}
            tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "var(--color-muted)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(245,130,13,0.05)" }} />
          <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />

          {!isCompare ? (
            <>
              <Bar dataKey={dailyKey} name={`${entityLabel} Daily`} isAnimationActive={false} maxBarSize={8}>
                {chartData.map((d, i) => {
                  const v = d[dailyKey] ?? 0;
                  return <Cell key={i} fill={v >= 0 ? TEAL : DANGER} />;
                })}
              </Bar>
              <Line
                type="monotone"
                dataKey={rollingKey}
                name="20D Avg"
                stroke={MUTED}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </>
          ) : (
            <>
              <Bar dataKey="fiiNet" name="FII Daily" isAnimationActive={false} maxBarSize={5}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={(d.fiiNet ?? 0) >= 0 ? TEAL : DANGER} opacity={0.9} />
                ))}
              </Bar>
              <Bar dataKey="diiNet" name="DII Daily" isAnimationActive={false} maxBarSize={5}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={(d.diiNet ?? 0) >= 0 ? TEAL : DANGER} opacity={0.45} />
                ))}
              </Bar>
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── Chart 2: Cumulative — only for single entity ────────────────── */}
      {!isCompare && (
        <>
          <div className="mt-5 mb-2 flex items-center gap-5 flex-wrap">
            <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
              Cumulative · {entityLabel} (₹ Cr)
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="inline-block w-5 h-[2px]" style={{ background: AMBER }} />
              Running total since start of series
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`cumulGrad-${entity}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={AMBER} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={AMBER} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                ticks={xTicks}
                tickFormatter={formatXTick}
                tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "var(--color-muted)" }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={crLabel}
                tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: AMBER, strokeWidth: 1, strokeDasharray: "3 3" }} />
              <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey={cumulKey}
                name="Cumulative"
                stroke={AMBER}
                strokeWidth={2}
                fill={`url(#cumulGrad-${entity})`}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
