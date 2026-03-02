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
} from "recharts";
import type { FiiDiiEntry, NiftyDayClose } from "@/lib/nse-flows";

type Segment = "equity" | "debt";
type Entity = "fii" | "dii" | "both";

interface FlowChartProps {
  entries: FiiDiiEntry[];
  nifty: NiftyDayClose[];
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
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded-lg p-3 text-xs font-mono shadow-xl">
      <p className="text-muted mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="leading-5">
          {p.name}:{" "}
          {p.value !== null && p.value !== undefined
            ? `₹${Math.round(p.value).toLocaleString("en-IN")} Cr`
            : "—"}
        </p>
      ))}
    </div>
  );
}

export function FlowChart({ entries, nifty }: FlowChartProps) {
  const [segment, setSegment] = useState<Segment>("equity");
  const [entity, setEntity] = useState<Entity>("fii");

  const niftyNormalised = useMemo(() => {
    if (!nifty.length || !entries.length) return new Map<string, number>();
    const maxNet = Math.max(...entries.map((e) => Math.abs(e.fiiEquityNet)), 1);
    const maxNifty = Math.max(...nifty.map((n) => n.close), 1);
    const scale = maxNet / maxNifty;
    const m = new Map<string, number>();
    nifty.forEach((n) => m.set(n.date, n.close * scale));
    return m;
  }, [entries, nifty]);

  const chartData = useMemo(() => {
    return entries.map((e) => {
      const fiiNet = segment === "equity" ? e.fiiEquityNet : e.fiiDebtNet;
      const diiNet = segment === "equity" ? e.diiEquityNet : e.diiDebtNet;
      const cumulFii = segment === "equity" ? e.cumulativeFiiEquityNet : null;
      const cumulDii = segment === "equity" ? e.cumulativeDiiEquityNet : null;
      const rollingFii = segment === "equity" ? e.rollingAvg20FiiEquity : null;
      const rollingDii = segment === "equity" ? e.rollingAvg20DiiEquity : null;
      const niftyVal = entity !== "both" ? (niftyNormalised.get(e.date) ?? null) : null;

      return {
        date: e.date,
        fiiNet,
        diiNet,
        cumulFii: entity === "fii" || entity === "both" ? cumulFii : null,
        cumulDii: entity === "dii" || entity === "both" ? cumulDii : null,
        rollingFii: entity === "fii" || entity === "both" ? rollingFii : null,
        rollingDii: entity === "dii" || entity === "both" ? rollingDii : null,
        nifty: niftyVal,
      };
    });
  }, [entries, segment, entity, niftyNormalised]);

  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    return chartData
      .filter((d) => {
        const month = d.date.slice(0, 7);
        if (seen.has(month)) return false;
        seen.add(month);
        return true;
      })
      .map((d) => d.date);
  }, [chartData]);

  return (
    <div>
      {/* Toggle controls */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex gap-1.5">
          <ToggleBtn
            label="EQUITY"
            active={segment === "equity"}
            onClick={() => setSegment("equity")}
          />
          <ToggleBtn
            label="DEBT"
            active={segment === "debt"}
            onClick={() => setSegment("debt")}
          />
        </div>
        <div className="w-px h-4 bg-[#1E2235]" />
        <div className="flex gap-1.5">
          <ToggleBtn label="FII" active={entity === "fii"} onClick={() => setEntity("fii")} />
          <ToggleBtn label="DII" active={entity === "dii"} onClick={() => setEntity("dii")} />
          <ToggleBtn
            label="FII vs DII"
            active={entity === "both"}
            onClick={() => setEntity("both")}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="w-3 h-2 rounded-sm bg-teal/70 inline-block" />
          Daily net (positive)
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="w-3 h-2 rounded-sm bg-danger/70 inline-block" />
          Daily net (negative)
        </span>
        {entity !== "both" && (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="w-4 h-px bg-amber inline-block" style={{ display: "inline-block", height: 2 }} />
              Cumulative net
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span
                className="w-4 inline-block"
                style={{ height: 1.5, background: "rgba(240,237,232,0.5)", display: "inline-block" }}
              />
              20D avg
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span
                className="w-4 inline-block"
                style={{ height: 1.5, background: "rgba(139,92,246,0.45)", display: "inline-block" }}
              />
              Nifty (scaled)
            </span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 52, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString("en-IN", { month: "short" })
            }
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
          />
          {/* Left Y: daily bars + rolling avg */}
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? `${(v / 1000).toFixed(0)}k`
                : String(Math.round(v))
            }
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          {/* Right Y: cumulative */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? `${(v / 1000).toFixed(0)}k`
                : String(Math.round(v))
            }
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="left" y={0} stroke="#1E2235" strokeWidth={1} />

          {/* FII daily bars */}
          {(entity === "fii" || entity === "both") && (
            <Bar
              yAxisId="left"
              dataKey="fiiNet"
              name="FII Daily Net"
              isAnimationActive={false}
              maxBarSize={entity === "both" ? 5 : 8}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={(d.fiiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"}
                  opacity={entity === "both" ? 0.8 : 1}
                />
              ))}
            </Bar>
          )}

          {/* DII daily bars */}
          {(entity === "dii" || entity === "both") && (
            <Bar
              yAxisId="left"
              dataKey="diiNet"
              name="DII Daily Net"
              isAnimationActive={false}
              maxBarSize={entity === "both" ? 5 : 8}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={(d.diiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"}
                  opacity={entity === "both" ? 0.45 : 1}
                />
              ))}
            </Bar>
          )}

          {/* Cumulative FII */}
          {entity !== "both" && (
            <Line
              yAxisId="right"
              dataKey={entity === "fii" ? "cumulFii" : "cumulDii"}
              name="Cumulative Net"
              stroke="#F5820D"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* 20-day rolling average */}
          {entity !== "both" && (
            <Line
              yAxisId="left"
              dataKey={entity === "fii" ? "rollingFii" : "rollingDii"}
              name="20D Avg"
              stroke="rgba(240,237,232,0.5)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
              strokeDasharray="4 2"
            />
          )}

          {/* Nifty normalised overlay */}
          {entity !== "both" && (
            <Line
              yAxisId="left"
              dataKey="nifty"
              name="Nifty (scaled)"
              stroke="rgba(139,92,246,0.45)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
