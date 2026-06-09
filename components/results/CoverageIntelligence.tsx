"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, FileText } from "lucide-react";
import {
  LineChart,
  Line,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { clsx } from "clsx";
import { CoverageRow } from "./CoverageRow";
import { FinancialsPanel } from "./FinancialsPanel";
import type { CoverageEntry } from "@/app/api/coverage/route";
import type { FinancialsResponse } from "@/app/api/coverage/[symbol]/financials/route";

// -- Constants ----------------------------------------------------------------

const ALL = "ALL";

type Tab = "overview" | "reports" | "earnings" | "financials";

const REPORT_TYPE_LABEL: Record<string, string> = {
  IC: "Initiation of Coverage",
  RU: "Result Update",
  CU: "Coverage Update",
  AU: "Annual Update",
  Technical: "Technical Note",
  "Visit Note": "Site Visit",
  Other: "Research Note",
};

const REPORT_TYPE_COLOR: Record<string, string> = {
  IC: "text-amber border-amber/40 bg-amber/10",
  RU: "text-teal border-teal/40 bg-teal/10",
  CU: "text-primary border-border bg-white/5",
  AU: "text-primary border-border bg-white/5",
  Technical: "text-muted border-border bg-transparent",
  "Visit Note": "text-muted border-border bg-transparent",
  Other: "text-muted border-border bg-transparent",
};

// -- Helpers ------------------------------------------------------------------

function ratingBg(rating: string): string {
  const r = rating.toUpperCase();
  if (/^(BUY|ACCUMULATE|ADD|STRONG.BUY|OUTPERFORM)/.test(r))
    return "bg-teal/15 text-teal border border-teal/30";
  if (/^(SELL|REDUCE|STRONG.SELL|UNDERPERFORM)/.test(r))
    return "bg-danger/15 text-danger border border-danger/30";
  if (/^(HOLD|NEUTRAL|MARKET.PERFORM)/.test(r))
    return "bg-amber/15 text-amber border border-amber/30";
  return "bg-white/5 text-muted border border-border";
}

function ratingDot(rating: string): string {
  const r = rating.toUpperCase();
  if (/^(BUY|ACCUMULATE|ADD|STRONG.BUY|OUTPERFORM)/.test(r)) return "#00C9A7";
  if (/^(SELL|REDUCE|STRONG.SELL|UNDERPERFORM)/.test(r)) return "#E84040";
  return "#F5820D";
}

function fmt(n: number): string {
  if (!n) return "--";
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// -- Target Price Walk Chart ---------------------------------------------------

interface DailyCandle {
  date: string;  // "YYYY-MM-DD"
  close: number;
}

interface MergedPoint {
  date: string;
  targetPrice?: number;
  cmp?: number;
  close?: number;
  rating?: string;
  analyst?: string;
  reportType?: string;
}

function TargetPriceWalk({
  reports,
  prices,
}: {
  reports: CoverageEntry["reports"];
  prices?: DailyCandle[];
}) {
  const reportPoints = reports
    .filter((r) => r.targetPrice > 0 || r.cmp > 0)
    .reverse() // chronological
    .map((r) => ({
      date: r.date,
      targetPrice: r.targetPrice || undefined,
      cmp: r.cmp || undefined,
      rating: r.rating,
      analyst: r.analyst,
      reportType: r.reportType,
    }));

  const hasPrices = prices && prices.length > 0;

  if (reportPoints.length < 1 && !hasPrices) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xl font-mono">No price target data available</p>
      </div>
    );
  }

  // Merge daily price candles + sparse report points into one sorted array
  const mergedMap = new Map<string, MergedPoint>();

  if (hasPrices) {
    prices!.forEach((p) => mergedMap.set(p.date, { date: p.date, close: p.close }));
  }
  reportPoints.forEach((r) => {
    const existing = mergedMap.get(r.date) ?? { date: r.date };
    mergedMap.set(r.date, { ...existing, ...r });
  });

  const merged = Array.from(mergedMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Quarterly tick dates to avoid x-axis clutter
  const ticks: string[] = [];
  let prevKey = -1;
  merged.forEach((p) => {
    const d = new Date(p.date);
    const key = d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
    if (key !== prevKey) { ticks.push(p.date); prevKey = key; }
  });

  const tickFmt = (date: string) =>
    new Date(date).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

  // Custom dot -- only rendered at report dates
  const ReportDot = (props: {
    cx?: number; cy?: number; payload?: MergedPoint; dataKey?: string;
  }) => {
    const { cx, cy, payload, dataKey } = props;
    if (!cx || !cy || !payload?.rating) return null;
    const isTarget = dataKey === "targetPrice";
    const color = isTarget ? ratingDot(payload.rating) : "#6B7280";
    return (
      <circle cx={cx} cy={cy} r={4} fill={color} stroke={color}
        strokeWidth={2} fillOpacity={isTarget ? 1 : 0.5} />
    );
  };

  const CustomTooltip = ({
    active, payload,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; payload: MergedPoint }>;
  }) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    const closeEntry = payload.find((p) => p.name === "Market Price");
    return (
      <div className="bg-[#13151E] border border-[#1E2235] rounded-lg p-3 text-xs font-mono shadow-xl min-w-[180px]">
        <p className="text-[#F0EDE8] mb-1.5 font-semibold">{fmtDate(pt.date)}</p>
        {closeEntry?.value != null && (
          <div className="flex justify-between gap-4 leading-5">
            <span style={{ color: "#3D7CAD" }}>Market price</span>
            <span style={{ color: "#3D7CAD" }}>{fmt(closeEntry.value)}</span>
          </div>
        )}
        {pt.reportType && (
          <p className="text-[#8890A4] mt-1 mb-0.5 text-[10px]">
            {REPORT_TYPE_LABEL[pt.reportType] ?? pt.reportType} · {pt.analyst}
          </p>
        )}
        {pt.targetPrice != null && (
          <div className="flex justify-between gap-4 leading-5">
            <span style={{ color: "#F5820D" }}>Target</span>
            <span style={{ color: "#F5820D" }}>{fmt(pt.targetPrice)}</span>
          </div>
        )}
        {pt.cmp != null && (
          <div className="flex justify-between gap-4 leading-5">
            <span className="text-[#8890A4]">CMP at issue</span>
            <span className="text-[#8890A4]">{fmt(pt.cmp)}</span>
          </div>
        )}
        {pt.targetPrice != null && pt.cmp != null && (
          <div className="flex justify-between gap-4 leading-5 mt-1 pt-1 border-t border-border">
            <span style={{ color: ratingDot(pt.rating ?? "") }}>Implied upside</span>
            <span style={{ color: ratingDot(pt.rating ?? "") }}>
              {(((pt.targetPrice - pt.cmp) / pt.cmp) * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {pt.rating && (
          <p className="mt-1.5">
            <span className={clsx("text-[19px] px-1.5 py-0.5 rounded border", ratingBg(pt.rating))}>
              {pt.rating}
            </span>
          </p>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={merged} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={tickFmt}
          tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#6B7280" }}
          axisLine={{ stroke: "#1E2235" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#6B7280" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`}
          width={72}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Historical market price -- steel blue, no dots */}
        {hasPrices && (
          <Line
            dataKey="close"
            name="Market Price"
            stroke="#3D7CAD"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "#3D7CAD" }}
            connectNulls
          />
        )}
        {/* CMP at each issue date */}
        <Line
          dataKey="cmp"
          name="CMP at issue"
          stroke="#4B5563"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={<ReportDot dataKey="cmp" />}
          activeDot={false}
          connectNulls
        />
        {/* Price target -- amber, rated dots */}
        <Line
          dataKey="targetPrice"
          name="Price Target"
          stroke="#F5820D"
          strokeWidth={2}
          dot={<ReportDot dataKey="targetPrice" />}
          activeDot={{ r: 6, strokeWidth: 0 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// -- Overview Tab --------------------------------------------------------------

function OverviewTab({
  entry,
  prices,
  breezeLoggedIn,
  breezeLoginUrl,
}: {
  entry: CoverageEntry;
  prices?: DailyCandle[] | null;
  breezeLoggedIn: boolean;
  breezeLoginUrl: string;
}) {
  const hasTPData = entry.reports.some((r) => r.targetPrice > 0 || r.cmp > 0);
  const upside =
    entry.latestTarget && entry.latestCmp
      ? (((entry.latestTarget - entry.latestCmp) / entry.latestCmp) * 100).toFixed(1)
      : null;
  const coverageSpan = (() => {
    const a = new Date(entry.firstDate);
    const b = new Date(entry.latestDate);
    const months =
      (b.getFullYear() - a.getFullYear()) * 12 +
      (b.getMonth() - a.getMonth());
    if (months < 1) return "< 1 month";
    if (months < 12) return `${months}mo`;
    return `${(months / 12).toFixed(1)}yr`;
  })();

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      {/* Key stats strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          {
            label: "Rating",
            value: entry.latestRating || "--",
            highlight: !!entry.latestRating,
            className: entry.latestRating
              ? ratingBg(entry.latestRating)
              : "text-[#8890A4]",
          },
          {
            label: "Price Target",
            value: entry.latestTarget ? `₹${entry.latestTarget.toLocaleString("en-IN")}` : "--",
            highlight: false,
            className: "",
          },
          {
            label: "CMP at Issue",
            value: entry.latestCmp ? `₹${entry.latestCmp.toLocaleString("en-IN")}` : "--",
            highlight: false,
            className: "",
          },
          {
            label: "Implied Upside",
            value: upside !== null ? `${upside}%` : "--",
            highlight: upside !== null,
            className:
              upside !== null
                ? parseFloat(upside) >= 0
                  ? "text-[#00C9A7]"
                  : "text-[#E84040]"
                : "",
          },
          {
            label: "Coverage",
            value: `${entry.reportCount} rpts · ${coverageSpan}`,
            highlight: false,
            className: "",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-surface border border-border rounded-lg p-3"
          >
            <p className="text-[9px] font-mono text-muted uppercase tracking-wider mb-1.5">
              {s.label}
            </p>
            <p
              className={clsx(
                "text-sm font-mono font-semibold",
                s.className || "text-primary"
              )}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Analyst coverage badges */}
      <div>
        <p className="text-[9px] font-mono text-muted uppercase tracking-wider mb-2">
          Covered by
        </p>
        <div className="flex gap-2 flex-wrap">
          {entry.analysts.map((a) => {
            const latestByAnalyst = entry.reports.find(
              (r) => r.analyst === a
            );
            return (
              <div
                key={a}
                className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2"
              >
                <div className="w-5 h-5 rounded-full bg-amber/20 text-amber flex items-center justify-center text-[9px] font-mono font-bold">
                  {a.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-mono text-primary">{a}</p>
                  {latestByAnalyst && (
                    <p className="text-[9px] font-mono text-muted">
                      {latestByAnalyst.rating || "--"} ·{" "}
                      {new Date(latestByAnalyst.date).toLocaleDateString(
                        "en-IN",
                        { month: "short", year: "2-digit" }
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Target price walk chart */}
      {hasTPData && (
        <div className="flex-1 min-h-[200px]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[9px] font-mono text-muted uppercase tracking-wider">
                Price Target Walk
              </p>
              {/* Visual legend */}
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[9px] font-mono text-amber">
                  <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                    <line x1="0" y1="4" x2="16" y2="4" stroke="#F5820D" strokeWidth="2" />
                  </svg>
                  Price Target
                </span>
                <span className="flex items-center gap-1.5 text-[9px] font-mono text-muted">
                  <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                    <line x1="0" y1="4" x2="16" y2="4" stroke="#6B7280" strokeWidth="1.5" strokeDasharray="4 2" />
                  </svg>
                  CMP at Issue
                </span>
                {prices && prices.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#3D7CAD" }}>
                    <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                      <line x1="0" y1="4" x2="16" y2="4" stroke="#3D7CAD" strokeWidth="1.5" />
                    </svg>
                    Market Price
                  </span>
                )}
              </div>
            </div>
            {!breezeLoggedIn && (
              <a
                href={breezeLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-mono text-muted/50 hover:text-amber transition-colors"
              >
                Connect Breeze for price history ↗
              </a>
            )}
            {breezeLoggedIn && prices === null && (
              <span className="text-[9px] font-mono text-danger/70">
                Price data unavailable
              </span>
            )}
          </div>
          <div className="h-[300px]">
            <TargetPriceWalk
              reports={entry.reports}
              prices={prices ?? undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// -- Reports Timeline Tab ------------------------------------------------------

function ReportsTab({ entry }: { entry: CoverageEntry }) {
  return (
    <div className="h-full overflow-y-auto space-y-2 pr-1">
      {entry.reports.map((r, i) => {
        const isLatest = i === 0;
        const upside =
          r.targetPrice && r.cmp
            ? (((r.targetPrice - r.cmp) / r.cmp) * 100).toFixed(1)
            : null;

        return (
          <div
            key={r.id}
            className={clsx(
              "border rounded-xl p-4 transition-colors",
              isLatest
                ? "border-amber/20 bg-amber/[0.04]"
                : "border-border bg-surface"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={clsx(
                    "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                    REPORT_TYPE_COLOR[r.reportType] ?? "text-muted border-border"
                  )}
                >
                  {r.reportType}
                </span>
                {r.rating && (
                  <span
                    className={clsx(
                      "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                      ratingBg(r.rating)
                    )}
                  >
                    {r.rating}
                  </span>
                )}
                {isLatest && (
                  <span className="text-[9px] font-mono text-amber/70">
                    latest
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-muted shrink-0">
                {fmtDate(r.date)}
              </p>
            </div>

            <div className="mt-2 flex items-center gap-5">
              <div>
                <p className="text-[9px] font-mono text-muted mb-0.5">
                  Analyst
                </p>
                <p className="text-xs font-mono text-primary">{r.analyst || "--"}</p>
              </div>
              {r.cmp > 0 && (
                <div>
                  <p className="text-[9px] font-mono text-muted mb-0.5">CMP</p>
                  <p className="text-xs font-mono text-primary">
                    {fmt(r.cmp)}
                  </p>
                </div>
              )}
              {r.targetPrice > 0 && (
                <div>
                  <p className="text-[9px] font-mono text-muted mb-0.5">
                    Target
                  </p>
                  <p className="text-xs font-mono text-amber">
                    {fmt(r.targetPrice)}
                  </p>
                </div>
              )}
              {upside !== null && (
                <div>
                  <p className="text-[9px] font-mono text-muted mb-0.5">
                    Upside at issue
                  </p>
                  <p
                    className={clsx(
                      "text-xs font-mono",
                      parseFloat(upside) >= 0 ? "text-teal" : "text-danger"
                    )}
                  >
                    {parseFloat(upside) >= 0 ? "+" : ""}
                    {upside}%
                  </p>
                </div>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <p className="text-[9px] font-mono text-muted flex-1">
                {REPORT_TYPE_LABEL[r.reportType] ?? r.reportType}
              </p>
              <Link
                href={`/reports?symbol=${entry.symbol}`}
                className="text-[9px] font-mono text-muted hover:text-amber transition-colors flex items-center gap-1"
              >
                <FileText className="w-2.5 h-2.5" />
                View in RAG
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -- Financials Tab ------------------------------------------------------------

function FinancialsTab({
  symbol,
  financialsMap,
  onLoad,
}: {
  symbol: string;
  financialsMap: Record<string, FinancialsResponse | null | "loading">;
  onLoad: (symbol: string) => void;
}) {
  useEffect(() => {
    if (!(symbol in financialsMap)) {
      onLoad(symbol);
    }
  }, [symbol, financialsMap, onLoad]);

  const data = financialsMap[symbol];

  if (!data || data === "loading") {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono animate-pulse">
          {data === "loading" ? "Parsing financials from PDF…" : "Preparing…"}
        </p>
      </div>
    );
  }

  const isEmpty =
    data.annual.length === 0 &&
    data.quarterly.length === 0 &&
    !data.ratios;

  if (isEmpty) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono">
          No structured financial tables found in PDF
        </p>
      </div>
    );
  }

  return (
    <FinancialsPanel
      snapshot={data}
      reportType={data.reportType}
      date={data.date}
      analyst={data.analyst}
    />
  );
}

// -- Earnings Tab (PDF-sourced) ------------------------------------------------

const TICK = { fill: "#7A8099", fontSize: 11, fontFamily: "JetBrains Mono" } as const;
const TT_STYLE = {
  background: "#13151E",
  border: "1px solid #1E2235",
  fontFamily: "JetBrains Mono",
  fontSize: 11,
  borderRadius: 8,
} as const;

function fmtCr(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString("en-IN");
}

function EarningsTab({
  symbol,
  financialsMap,
  onLoad,
}: {
  symbol: string;
  financialsMap: Record<string, FinancialsResponse | null | "loading">;
  onLoad: (symbol: string) => void;
}) {
  useEffect(() => {
    if (!(symbol in financialsMap)) {
      onLoad(symbol);
    }
  }, [symbol, financialsMap, onLoad]);

  const data = financialsMap[symbol];

  if (!data || data === "loading") {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono animate-pulse">
          {data === "loading" ? "Parsing earnings from PDF…" : "Preparing…"}
        </p>
      </div>
    );
  }

  const quarters = data.quarterly;

  if (quarters.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono">
          No quarterly earnings data found in PDF
        </p>
      </div>
    );
  }

  const chartData = quarters.map((q) => ({
    quarter: q.quarter,
    revenue: q.revenues,
    ebitda: q.ebitda,
    ebitdaPct: q.ebitdaPct,
    pat: q.netProfit,
    patPct:
      q.revenues && q.netProfit
        ? +((q.netProfit / q.revenues) * 100).toFixed(1)
        : null,
  }));

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto pr-1">
      {/* Two charts side by side */}
      <div className="grid grid-cols-2 gap-3 shrink-0" style={{ height: 180 }}>
        {/* Revenue + EBITDA% */}
        <div>
          <p className="text-[9px] font-mono text-muted uppercase tracking-wider mb-1.5">
            Revenue{" "}
            <span className="text-teal normal-case">+ EBITDA%</span>
          </p>
          <ResponsiveContainer width="100%" height={158}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 36, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1E2235"
                vertical={false}
              />
              <XAxis
                dataKey="quarter"
                tick={TICK}
                axisLine={{ stroke: "#1E2235" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="bar"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtCr}
                width={36}
              />
              <YAxis
                yAxisId="line"
                orientation="right"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={32}
              />
              <Tooltip
                contentStyle={TT_STYLE}
                formatter={(value: number | undefined, name: string | undefined) => [
                  name === "ebitdaPct"
                    ? `${value?.toFixed(1) ?? "--"}%`
                    : `₹${value?.toLocaleString("en-IN") ?? "--"} Cr`,
                  name === "ebitdaPct" ? "EBITDA%" : "Revenue",
                ]}
              />
              <Bar
                yAxisId="bar"
                dataKey="revenue"
                fill="#F5820D"
                opacity={0.8}
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="line"
                type="monotone"
                dataKey="ebitdaPct"
                stroke="#00C9A7"
                dot={{ fill: "#00C9A7", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                strokeWidth={2}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* PAT + PAT margin */}
        <div>
          <p className="text-[9px] font-mono text-muted uppercase tracking-wider mb-1.5">
            PAT{" "}
            <span className="text-amber normal-case">+ PAT%</span>
          </p>
          <ResponsiveContainer width="100%" height={158}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 36, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1E2235"
                vertical={false}
              />
              <XAxis
                dataKey="quarter"
                tick={TICK}
                axisLine={{ stroke: "#1E2235" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="bar"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtCr}
                width={36}
              />
              <YAxis
                yAxisId="line"
                orientation="right"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={32}
              />
              <ReferenceLine
                yAxisId="line"
                y={0}
                stroke="#2A2E45"
                strokeDasharray="4 4"
              />
              <Tooltip
                contentStyle={TT_STYLE}
                formatter={(value: number | undefined, name: string | undefined) => [
                  name === "patPct"
                    ? `${value?.toFixed(1) ?? "--"}%`
                    : `₹${value?.toLocaleString("en-IN") ?? "--"} Cr`,
                  name === "patPct" ? "PAT%" : "PAT",
                ]}
              />
              <Bar
                yAxisId="bar"
                dataKey="pat"
                fill="#7A8099"
                opacity={0.75}
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="line"
                type="monotone"
                dataKey="patPct"
                stroke="#F5820D"
                dot={{ fill: "#F5820D", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                strokeWidth={2}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quarterly table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-2 py-1.5 text-muted font-normal">
                Quarter
              </th>
              <th className="text-right px-2 py-1.5 text-muted font-normal">
                Revenue
              </th>
              <th className="text-right px-2 py-1.5 text-muted font-normal">
                EBITDA
              </th>
              <th className="text-right px-2 py-1.5 text-muted font-normal">
                EBITDA%
              </th>
              <th className="text-right px-2 py-1.5 text-muted font-normal">
                PAT
              </th>
              <th className="text-right px-2 py-1.5 text-muted font-normal">
                PAT%
              </th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => {
              const patPct =
                q.revenues && q.netProfit
                  ? (q.netProfit / q.revenues) * 100
                  : null;
              return (
                <tr
                  key={q.quarter}
                  className="border-b border-border/40 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-2 py-1.5 text-amber font-semibold">
                    {q.quarter}
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary">
                    {q.revenues != null
                      ? q.revenues.toLocaleString("en-IN")
                      : "--"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary">
                    {q.ebitda != null
                      ? q.ebitda.toLocaleString("en-IN")
                      : "--"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-teal">
                    {q.ebitdaPct != null ? `${q.ebitdaPct.toFixed(1)}%` : "--"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary">
                    {q.netProfit != null
                      ? q.netProfit.toLocaleString("en-IN")
                      : "--"}
                  </td>
                  <td
                    className="px-2 py-1.5 text-right"
                    style={{
                      color:
                        patPct != null
                          ? patPct >= 0
                            ? "#00C9A7"
                            : "#E84040"
                          : "#7A8099",
                    }}
                  >
                    {patPct != null ? `${patPct.toFixed(1)}%` : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] font-mono text-muted shrink-0">
        Source: {data.reportType} ·{" "}
        {new Date(data.date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}{" "}
        · {quarters.length} quarters
      </p>
    </div>
  );
}

// -- Main Component ------------------------------------------------------------

export function CoverageIntelligence() {
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [filterAnalyst, setFilterAnalyst] = useState(ALL);
  const [filterRating, setFilterRating] = useState(ALL);
  const [financialsMap, setFinancialsMap] = useState<
    Record<string, FinancialsResponse | null | "loading">
  >({});
  const [breezeLoggedIn, setBreezeLoggedIn] = useState(false);
  const [breezeLoginUrl, setBreezeLoginUrl] = useState("");
  const [priceMap, setPriceMap] = useState<
    Record<string, DailyCandle[] | null | "loading">
  >({});

  // Load coverage universe
  useEffect(() => {
    fetch("/api/coverage")
      .then((r) => (r.ok ? (r.json() as Promise<CoverageEntry[]>) : Promise.reject()))
      .then((data) => {
        setCoverage(data);
        setLoading(false);
        setSelected(data[0]?.symbol ?? null);
      })
      .catch(() => {
        setError("Failed to load coverage universe");
        setLoading(false);
      });
  }, []);

  // Check Breeze session on mount
  useEffect(() => {
    fetch("/api/breeze/auth")
      .then((r) => r.json() as Promise<{ loggedIn: boolean; loginUrl: string }>)
      .then((d) => { setBreezeLoggedIn(d.loggedIn); setBreezeLoginUrl(d.loginUrl); })
      .catch(() => { });
  }, []);

  // Lazy-load historical prices when overview is active + Breeze connected
  useEffect(() => {
    if (activeTab !== "overview" || !selected || !breezeLoggedIn) return;
    if (selected in priceMap) return;
    const entry = coverage.find((c) => c.symbol === selected);
    if (!entry) return;
    setPriceMap((prev) => ({ ...prev, [selected]: "loading" }));
    const from = entry.firstDate.split("T")[0];
    const to = new Date().toISOString().split("T")[0];
    fetch(`/api/breeze/historical/${selected}?from=${from}&to=${to}`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ candles: DailyCandle[] }>)
          : Promise.reject(r.status)
      )
      .then((d) => setPriceMap((prev) => ({ ...prev, [selected]: d.candles })))
      .catch(() => setPriceMap((prev) => ({ ...prev, [selected]: null })));
  }, [activeTab, selected, breezeLoggedIn, priceMap, coverage]);

  // Load financials (lazy -- only when tab is active)
  const loadFinancials = useCallback((symbol: string) => {
    setFinancialsMap((prev) => ({ ...prev, [symbol]: "loading" }));
    fetch(`/api/coverage/${symbol}/financials`)
      .then((r) => (r.ok ? (r.json() as Promise<FinancialsResponse>) : null))
      .then((data) =>
        setFinancialsMap((prev) => ({ ...prev, [symbol]: data }))
      )
      .catch(() =>
        setFinancialsMap((prev) => ({ ...prev, [symbol]: null }))
      );
  }, []);

  // Build filter options
  const allAnalysts = [
    ALL,
    ...new Set(coverage.flatMap((c) => c.analysts).filter(Boolean)),
  ].sort();
  const allRatings = [
    ALL,
    ...new Set(
      coverage
        .map((c) => c.latestRating.split(" ")[0])
        .filter(Boolean)
    ),
  ].sort();

  // Filter list
  const filtered = coverage.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.symbol.toLowerCase().includes(q) &&
        !c.company.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterAnalyst !== ALL && !c.analysts.includes(filterAnalyst))
      return false;
    if (
      filterRating !== ALL &&
      !c.latestRating.toUpperCase().startsWith(filterRating.toUpperCase())
    )
      return false;
    return true;
  });

  const selectedEntry = coverage.find((c) => c.symbol === selected) ?? null;

  // -- Loading skeleton -------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="animate-pulse h-10 bg-surface rounded-lg border border-border" />
        <div className="flex gap-4" style={{ height: "calc(100vh - 17rem)" }}>
          <div className="w-[280px] animate-pulse bg-surface rounded-xl border border-border" />
          <div className="flex-1 animate-pulse bg-surface rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  // -- Render -----------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="px-4 py-2 rounded border border-danger/30 bg-danger/5 text-danger text-xs font-mono">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Symbol or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border rounded pl-7 pr-3 py-1.5 text-xs font-mono text-primary placeholder:text-muted focus:outline-none focus:border-amber/60 transition-colors w-48"
          />
        </div>

        {/* Analyst filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Analyst
          </span>
          <select
            value={filterAnalyst}
            onChange={(e) => setFilterAnalyst(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-primary focus:outline-none focus:border-amber/60 transition-colors"
          >
            {allAnalysts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Rating filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Rating
          </span>
          <select
            value={filterRating}
            onChange={(e) => setFilterRating(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono text-primary focus:outline-none focus:border-amber/60 transition-colors"
          >
            {allRatings.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <span className="text-[10px] font-mono text-muted ml-auto">
          {filtered.length}/{coverage.length} covered
        </span>
      </div>

      {/* Split view */}
      <div
        className="flex gap-4"
        style={{ height: "calc(100vh - 17rem)" }}
      >
        {/* -- Left: coverage list --------------------------------------------- */}
        <div className="w-[280px] shrink-0 border border-border rounded-xl bg-surface overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-muted text-xs font-mono p-4 text-center">
              No stocks match
            </p>
          ) : (
            filtered.map((entry) => (
              <CoverageRow
                key={entry.symbol}
                entry={entry}
                selected={selected === entry.symbol}
                onClick={() => {
                  setSelected(entry.symbol);
                  setActiveTab("overview");
                }}
              />
            ))
          )}
        </div>

        {/* -- Right: detail panel --------------------------------------------- */}
        <div className="flex-1 min-w-0 border border-border rounded-xl bg-surface p-5 flex flex-col gap-4">
          {!selectedEntry ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted font-mono text-sm">
                Select a stock to view coverage details
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="font-display text-2xl font-semibold text-primary leading-tight">
                      {selectedEntry.company}
                    </h2>
                    <Link
                      href={`/research/${selectedEntry.symbol}`}
                      className="text-xs font-mono text-muted hover:text-amber transition-colors"
                      title="Open research page"
                    >
                      ↗
                    </Link>
                  </div>
                  <p className="text-xs font-mono text-muted">
                    {selectedEntry.symbol}
                    {selectedEntry.analysts.length > 0 &&
                      ` · ${selectedEntry.analysts.slice(0, 2).join(", ")}`}
                    {selectedEntry.analysts.length > 2 &&
                      ` +${selectedEntry.analysts.length - 2} more`}
                  </p>
                </div>
                {selectedEntry.latestRating && (
                  <span
                    className={clsx(
                      "text-xs font-mono px-2.5 py-1.5 rounded-lg",
                      ratingBg(selectedEntry.latestRating)
                    )}
                  >
                    {selectedEntry.latestRating}
                    {selectedEntry.latestTarget
                      ? ` · TP ₹${selectedEntry.latestTarget.toLocaleString("en-IN")}`
                      : ""}
                  </span>
                )}
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 border-b border-border pb-1">
                {(
                  [
                    { id: "overview", label: "Overview" },
                    {
                      id: "reports",
                      label: `Reports (${selectedEntry.reportCount})`,
                    },
                    { id: "earnings", label: "Earnings" },
                    { id: "financials", label: "Financials" },
                  ] as { id: Tab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      "px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors",
                      activeTab === tab.id
                        ? "bg-amber text-background font-medium"
                        : "text-muted hover:text-primary"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0">
                {activeTab === "overview" && (
                  <OverviewTab
                    entry={selectedEntry}
                    prices={
                      priceMap[selectedEntry.symbol] === "loading"
                        ? undefined
                        : (priceMap[selectedEntry.symbol] as DailyCandle[] | null | undefined)
                    }
                    breezeLoggedIn={breezeLoggedIn}
                    breezeLoginUrl={breezeLoginUrl}
                  />
                )}

                {activeTab === "reports" && (
                  <ReportsTab entry={selectedEntry} />
                )}

                {activeTab === "earnings" && (
                  <EarningsTab
                    symbol={selectedEntry.symbol}
                    financialsMap={financialsMap}
                    onLoad={loadFinancials}
                  />
                )}

                {activeTab === "financials" && (
                  <FinancialsTab
                    symbol={selectedEntry.symbol}
                    financialsMap={financialsMap}
                    onLoad={loadFinancials}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
