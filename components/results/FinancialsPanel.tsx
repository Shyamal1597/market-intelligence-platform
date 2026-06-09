"use client";

import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { clsx } from "clsx";
import type { FinancialSnapshot, AnnualRow, QuarterlyRow } from "@/lib/pdf-financials-parser";

// -- Types ---------------------------------------------------------------------

type FinTab = "annual" | "quarterly" | "valuation";

interface Props {
  snapshot: FinancialSnapshot;
  reportType?: string;
  date?: string;
  analyst?: string;
}

// -- Format helpers ------------------------------------------------------------

function fmtRev(v: number | null): string {
  if (v === null) return "--";
  return v.toLocaleString("en-IN");
}
function fmtPct(v: number | null, d = 1): string {
  if (v === null) return "--";
  return `${v.toFixed(d)}%`;
}
function fmtX(v: number | null, d = 1): string {
  if (v === null) return "--";
  return `${v.toFixed(d)}x`;
}
function fmtEPS(v: number | null): string {
  if (v === null) return "--";
  return `₹${v.toFixed(1)}`;
}
function fmtK(v: number): string {
  if (v >= 100000) return `${(v / 100000).toFixed(0)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(Math.round(v));
}

// -- Custom Tooltip -------------------------------------------------------------

interface TooltipPayload {
  name: string;
  value: number;
  color?: string;
}
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13151E] border border-border rounded-lg p-2.5 text-xs font-mono shadow-xl min-w-[160px]">
      <p className="text-[#F0EDE8] font-semibold mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 leading-5">
          <span style={{ color: p.color ?? "#6B7280" }}>{p.name}</span>
          <span style={{ color: p.color ?? "#F0EDE8" }}>
            {typeof p.value === "number"
              ? p.name.includes("%")
                ? `${p.value.toFixed(1)}%`
                : p.name.includes("P/E") || p.name.includes("EV")
                ? `${p.value.toFixed(1)}x`
                : p.value.toLocaleString("en-IN")
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// -- Annual tab -----------------------------------------------------------------

function AnnualSection({ rows }: { rows: AnnualRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[#6B7280] text-xs font-mono">
          No annual P&L data found in this PDF
        </p>
      </div>
    );
  }

  // Compute EBITDA% from Rev+EBITDA if not already present
  const enriched = rows.map((r) => ({
    ...r,
    ebitdaPct:
      r.ebitdaPct ??
      (r.ebitda !== null && r.rev !== null && r.rev > 0
        ? parseFloat(((r.ebitda / r.rev) * 100).toFixed(1))
        : null),
  }));

  const chartData = enriched.map((r) => ({
    fy: r.fy,
    "Revenue (₹ mn)": r.rev,
    "EBITDA %": r.ebitdaPct,
    estimate: r.isEstimate,
  }));

  const estStart = enriched.findIndex((r) => r.isEstimate);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      {/* Combo chart: Revenue bars + EBITDA% line */}
      <div className="h-[200px] shrink-0">
        <p className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider mb-2">
          Revenue (₹ mn) &amp; EBITDA Margin %
          {estStart > 0 && (
            <span className="text-[#F5820D]/70 ml-2 normal-case">
              · dashed = estimates
            </span>
          )}
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 40, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={{ stroke: "#1E2235" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtK}
              width={44}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={36}
              domain={[0, "auto"]}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="Revenue (₹ mn)"
              fill="#00C9A7"
              fillOpacity={0.6}
              radius={[2, 2, 0, 0]}
              maxBarSize={32}
            />
            <Line
              yAxisId="right"
              dataKey="EBITDA %"
              stroke="#F5820D"
              strokeWidth={2}
              dot={{ r: 3, fill: "#F5820D", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* P&L summary table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["FY", "Revenue", "EBITDA", "EBITDA%", "PAT", "EPS", "P/E", "EV/EBITDA", "ROE%"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-right first:text-left text-[9px] uppercase tracking-wider text-[#6B7280] font-normal whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {enriched.map((r) => (
              <tr
                key={r.fy}
                className={clsx(
                  "border-b border-border/50 transition-colors hover:bg-white/[0.02]",
                  r.isEstimate ? "text-[#F5820D]" : "text-[#F0EDE8]"
                )}
              >
                <td className="px-2 py-1.5 font-semibold">
                  {r.fy}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtRev(r.rev)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtRev(r.ebitda)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtPct(r.ebitdaPct)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtRev(r.pat)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtEPS(r.eps)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtX(r.pe)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtX(r.evEbitda)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtPct(r.roe)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[9px] font-mono text-[#6B7280]/60 mt-2 pl-2">
          ₹ mn · estimates in amber
        </p>
      </div>
    </div>
  );
}

// -- Quarterly tab --------------------------------------------------------------

function QuarterlySection({ rows }: { rows: QuarterlyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[#6B7280] text-xs font-mono">
          No quarterly data found in this PDF
        </p>
      </div>
    );
  }

  const display = rows.slice(-10); // show last 10 quarters max in chart

  const chartData = display.map((r) => ({
    q: r.quarter.replace("FY", "'"),
    "Revenue": r.revenues,
    "EBITDA %": r.ebitdaPct,
  }));

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      {/* Combo chart */}
      <div className="h-[200px] shrink-0">
        <p className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider mb-2">
          Revenue (₹ mn) &amp; EBITDA Margin % -- Last {display.length} quarters
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 40, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
            <XAxis
              dataKey="q"
              tick={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={{ stroke: "#1E2235" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtK}
              width={44}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="Revenue"
              fill="#00C9A7"
              fillOpacity={0.6}
              radius={[2, 2, 0, 0]}
              maxBarSize={28}
            />
            <Line
              yAxisId="right"
              dataKey="EBITDA %"
              stroke="#F5820D"
              strokeWidth={2}
              dot={{ r: 3, fill: "#F5820D", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quarterly table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Quarter", "Revenue", "EBITDA", "EBITDA%", "Net Profit", "PAT%"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-right first:text-left text-[9px] uppercase tracking-wider text-[#6B7280] font-normal whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(-12).map((r) => {
              const patPct =
                r.netProfit !== null && r.revenues !== null && r.revenues > 0
                  ? ((r.netProfit / r.revenues) * 100).toFixed(1)
                  : null;
              return (
                <tr
                  key={r.quarter}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors text-[#F0EDE8]"
                >
                  <td className="px-2 py-1.5 font-semibold text-[#F5820D]">
                    {r.quarter}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtRev(r.revenues)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtRev(r.ebitda)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtPct(r.ebitdaPct)}
                  </td>
                  <td
                    className={clsx(
                      "px-2 py-1.5 text-right tabular-nums",
                      r.netProfit !== null
                        ? r.netProfit < 0
                          ? "text-[#E84040]"
                          : "text-[#00C9A7]"
                        : ""
                    )}
                  >
                    {fmtRev(r.netProfit)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#6B7280]">
                    {patPct !== null ? `${patPct}%` : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[9px] font-mono text-[#6B7280]/60 mt-2 pl-2">
          ₹ mn
        </p>
      </div>
    </div>
  );
}

// -- Valuation tab --------------------------------------------------------------

function ValuationSection({ snapshot }: { snapshot: FinancialSnapshot }) {
  const { ratios, balanceSheet, annual } = snapshot;

  const hasRatios = ratios !== null;
  const hasBs = balanceSheet !== null;
  const hasAnnualRatios = annual.some((r) => r.pe !== null || r.evEbitda !== null);

  if (!hasRatios && !hasAnnualRatios) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[#6B7280] text-xs font-mono">
          No valuation data found in this PDF
        </p>
      </div>
    );
  }

  // Build chart data from ratios (preferred) or annual rows
  const chartData = hasRatios
    ? ratios!.years.map((y, i) => ({
        year: y,
        "P/E": ratios!.pe[i],
        "EV/EBITDA": ratios!.evEbitda[i],
      }))
    : annual.map((r) => ({
        year: r.fy,
        "P/E": r.pe,
        "EV/EBITDA": r.evEbitda,
      }));

  // Compact ratio table
  const tableYears = ratios?.years ?? annual.map((r) => r.fy);
  const metricRows: Array<{ label: string; values: (number | null)[]; fmt: (v: number | null) => string }> =
    hasRatios
      ? [
          { label: "Adj. EPS (₹)", values: ratios!.eps, fmt: (v) => (v === null ? "--" : v.toFixed(1)) },
          { label: "P/E (x)", values: ratios!.pe, fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}x`) },
          { label: "EV/EBITDA (x)", values: ratios!.evEbitda, fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}x`) },
          { label: "EBITDA Margin", values: ratios!.ebitdaPct, fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}%`) },
          { label: "RoAE", values: ratios!.roe, fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}%`) },
        ]
      : [
          { label: "P/E (x)", values: annual.map((r) => r.pe), fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}x`) },
          { label: "EV/EBITDA (x)", values: annual.map((r) => r.evEbitda), fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}x`) },
          { label: "Adj. EPS (₹)", values: annual.map((r) => r.eps), fmt: (v) => (v === null ? "--" : `${v.toFixed(1)}`) },
        ];

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      {/* P/E + EV/EBITDA trend chart */}
      <div className="h-[180px] shrink-0">
        <p className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider mb-2">
          P/E &amp; EV/EBITDA -- Valuation trend
        </p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={{ stroke: "#1E2235" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}x`}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            />
            <Line
              dataKey="P/E"
              stroke="#F5820D"
              strokeWidth={2}
              dot={{ r: 3, fill: "#F5820D", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
            <Line
              dataKey="EV/EBITDA"
              stroke="#00C9A7"
              strokeWidth={2}
              dot={{ r: 3, fill: "#00C9A7", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Ratio table (metrics as rows, years as columns) */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left text-[9px] uppercase tracking-wider text-[#6B7280] font-normal">
                Metric
              </th>
              {tableYears.map((y) => (
                <th
                  key={y}
                  className={clsx(
                    "px-2 py-1.5 text-right text-[9px] uppercase tracking-wider font-normal whitespace-nowrap",
                    /[EP]$/.test(y) ? "text-[#F5820D]" : "text-[#6B7280]"
                  )}
                >
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border/50 hover:bg-white/[0.02] transition-colors text-[#F0EDE8]"
              >
                <td className="px-2 py-1.5 text-[#6B7280]">{row.label}</td>
                {row.values.map((v, i) => (
                  <td
                    key={i}
                    className={clsx(
                      "px-2 py-1.5 text-right tabular-nums",
                      /[EP]$/.test(tableYears[i]) ? "text-[#F5820D]" : ""
                    )}
                  >
                    {row.fmt(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Balance sheet summary */}
      {hasBs && (
        <div className="overflow-x-auto">
          <p className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider mb-2 px-2">
            Balance Sheet (₹ mn)
          </p>
          <table className="w-full text-[11px] font-mono border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[9px] uppercase tracking-wider text-[#6B7280] font-normal">
                  Item
                </th>
                {balanceSheet!.years.map((y) => (
                  <th
                    key={y}
                    className={clsx(
                      "px-2 py-1.5 text-right text-[9px] uppercase tracking-wider font-normal whitespace-nowrap",
                      /[EP]$/.test(y) ? "text-[#F5820D]" : "text-[#6B7280]"
                    )}
                  >
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Net Worth", values: balanceSheet!.equity },
                { label: "Total Debt", values: balanceSheet!.totalDebt },
                { label: "Total Assets", values: balanceSheet!.totalAssets },
              ].map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors text-[#F0EDE8]"
                >
                  <td className="px-2 py-1.5 text-[#6B7280]">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td
                      key={i}
                      className={clsx(
                        "px-2 py-1.5 text-right tabular-nums",
                        /[EP]$/.test(balanceSheet!.years[i]) ? "text-[#F5820D]" : ""
                      )}
                    >
                      {fmtRev(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -- Main -----------------------------------------------------------------------

export function FinancialsPanel({ snapshot, reportType, date, analyst }: Props) {
  const [activeTab, setActiveTab] = useState<FinTab>("annual");

  const tabs: Array<{ id: FinTab; label: string; count?: number }> = [
    { id: "annual", label: "Annual P&L", count: snapshot.annual.length },
    { id: "quarterly", label: "Quarterly", count: snapshot.quarterly.length },
    {
      id: "valuation",
      label: "Valuation",
      count: snapshot.ratios?.years.length ?? snapshot.annual.filter((r) => r.pe).length,
    },
  ];

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Source badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[9px] font-mono text-[#6B7280] uppercase tracking-wider">
          Parsed from
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border bg-[#F5820D]/10 text-[#F5820D]">
          {reportType ?? snapshot.source}
        </span>
        {date && (
          <span className="text-[9px] font-mono text-[#6B7280]">
            {new Date(date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {analyst ? ` · ${analyst}` : ""}
          </span>
        )}
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-border shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={clsx(
              "px-3 py-1.5 text-[10px] font-mono rounded-t transition-colors flex items-center gap-1.5",
              activeTab === t.id
                ? "bg-[#1E2235] text-[#F0EDE8]"
                : "text-[#6B7280] hover:text-[#F0EDE8]"
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={clsx(
                  "text-[8px] px-1 rounded",
                  activeTab === t.id
                    ? "bg-[#F5820D]/20 text-[#F5820D]"
                    : "bg-[#1E2235] text-[#6B7280]"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "annual" && <AnnualSection rows={snapshot.annual} />}
        {activeTab === "quarterly" && <QuarterlySection rows={snapshot.quarterly} />}
        {activeTab === "valuation" && <ValuationSection snapshot={snapshot} />}
      </div>
    </div>
  );
}
