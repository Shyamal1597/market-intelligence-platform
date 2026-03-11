"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, RefreshCw, FileText } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { clsx } from "clsx";
import { CoverageRow } from "./CoverageRow";
import { EarningsChart } from "./EarningsChart";
import type { CoverageEntry } from "@/app/api/coverage/route";
import type { InsightsData } from "@/app/api/coverage/[symbol]/route";
import type { EarningsData } from "@/lib/earnings";
import type { WatchlistEntry } from "@/lib/watchlist";

// ── Constants ────────────────────────────────────────────────────────────────

const ALL = "ALL";

type Tab = "overview" | "reports" | "earnings" | "insights";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!n) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Target Price Walk Chart ───────────────────────────────────────────────────

interface TPPoint {
  label: string;        // "Jan '25"
  fullDate: string;     // ISO
  targetPrice: number;
  cmp: number;
  rating: string;
  analyst: string;
  reportType: string;
}

function TargetPriceWalk({ reports }: { reports: CoverageEntry["reports"] }) {
  const points: TPPoint[] = reports
    .filter((r) => r.targetPrice > 0 || r.cmp > 0)
    .reverse() // chronological
    .map((r) => ({
      label: new Date(r.date).toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      }),
      fullDate: r.date,
      targetPrice: r.targetPrice || 0,
      cmp: r.cmp || 0,
      rating: r.rating,
      analyst: r.analyst,
      reportType: r.reportType,
    }));

  if (points.length < 1) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono">No price target data available</p>
      </div>
    );
  }

  // Custom dot colored by rating
  const CustomDot = (props: {
    cx?: number;
    cy?: number;
    payload?: TPPoint;
    dataKey?: string;
  }) => {
    const { cx, cy, payload, dataKey } = props;
    if (!cx || !cy || !payload) return null;
    const color =
      dataKey === "targetPrice" ? ratingDot(payload.rating) : "#7A8099";
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke={dataKey === "targetPrice" ? color : "#7A8099"}
        strokeWidth={2}
        fillOpacity={dataKey === "targetPrice" ? 1 : 0.6}
      />
    );
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; payload: TPPoint }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    return (
      <div className="bg-[#13151E] border border-[#1E2235] rounded-lg p-3 text-xs font-mono shadow-xl min-w-[180px]">
        <p className="text-primary mb-1.5 font-semibold">{fmtDate(pt.fullDate)}</p>
        <p className="text-muted mb-1">
          {REPORT_TYPE_LABEL[pt.reportType] ?? pt.reportType} · {pt.analyst}
        </p>
        {pt.targetPrice > 0 && (
          <div className="flex justify-between gap-4 leading-5">
            <span className="text-amber">Target</span>
            <span className="text-amber">{fmt(pt.targetPrice)}</span>
          </div>
        )}
        {pt.cmp > 0 && (
          <div className="flex justify-between gap-4 leading-5">
            <span className="text-muted">CMP at issue</span>
            <span className="text-muted">{fmt(pt.cmp)}</span>
          </div>
        )}
        {pt.targetPrice > 0 && pt.cmp > 0 && (
          <div className="flex justify-between gap-4 leading-5 mt-1 pt-1 border-t border-border">
            <span style={{ color: ratingDot(pt.rating) }}>Implied upside</span>
            <span style={{ color: ratingDot(pt.rating) }}>
              {(((pt.targetPrice - pt.cmp) / pt.cmp) * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {pt.rating && (
          <p className="mt-1.5">
            <span
              className={clsx(
                "text-[9px] px-1.5 py-0.5 rounded border",
                ratingBg(pt.rating)
              )}
            >
              {pt.rating}
            </span>
          </p>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={points}
        margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#1E2235"
          vertical={false}
        />
        <XAxis
          dataKey="label"
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
        />
        <Tooltip content={<CustomTooltip />} />
        {/* CMP at each issue date */}
        <Line
          dataKey="cmp"
          name="CMP at issue"
          stroke="#4B5563"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={<CustomDot dataKey="cmp" />}
          activeDot={false}
          connectNulls
        />
        {/* Target price */}
        <Line
          dataKey="targetPrice"
          name="Price Target"
          stroke="#F5820D"
          strokeWidth={2}
          dot={<CustomDot dataKey="targetPrice" />}
          activeDot={{ r: 6, strokeWidth: 0 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ entry }: { entry: CoverageEntry }) {
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
            value: entry.latestRating || "—",
            highlight: !!entry.latestRating,
            className: entry.latestRating
              ? ratingBg(entry.latestRating)
              : "text-muted",
          },
          {
            label: "Price Target",
            value: entry.latestTarget ? `₹${entry.latestTarget.toLocaleString("en-IN")}` : "—",
            highlight: false,
            className: "",
          },
          {
            label: "CMP at Issue",
            value: entry.latestCmp ? `₹${entry.latestCmp.toLocaleString("en-IN")}` : "—",
            highlight: false,
            className: "",
          },
          {
            label: "Implied Upside",
            value: upside !== null ? `${upside}%` : "—",
            highlight: upside !== null,
            className:
              upside !== null
                ? parseFloat(upside) >= 0
                  ? "text-teal"
                  : "text-danger"
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
            className="bg-[#0C0E14] border border-border rounded-lg p-3"
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
                className="flex items-center gap-2 bg-[#0C0E14] border border-border rounded-lg px-3 py-2"
              >
                <div className="w-5 h-5 rounded-full bg-amber/20 text-amber flex items-center justify-center text-[9px] font-mono font-bold">
                  {a.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-mono text-primary">{a}</p>
                  {latestByAnalyst && (
                    <p className="text-[9px] font-mono text-muted">
                      {latestByAnalyst.rating || "—"} ·{" "}
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
          <p className="text-[9px] font-mono text-muted uppercase tracking-wider mb-2">
            Price Target Walk{" "}
            <span className="text-muted/50 normal-case">
              (amber = target, dashed = CMP at issue)
            </span>
          </p>
          <div className="h-[200px]">
            <TargetPriceWalk reports={entry.reports} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reports Timeline Tab ──────────────────────────────────────────────────────

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
                : "border-border bg-[#0C0E14]"
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
                <p className="text-xs font-mono text-primary">{r.analyst || "—"}</p>
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

// ── Insights Tab ──────────────────────────────────────────────────────────────

function InsightsTab({
  symbol,
  insightsMap,
  onLoad,
}: {
  symbol: string;
  insightsMap: Record<string, InsightsData | null | "loading">;
  onLoad: (symbol: string) => void;
}) {
  useEffect(() => {
    if (!(symbol in insightsMap)) {
      onLoad(symbol);
    }
  }, [symbol, insightsMap, onLoad]);

  const data = insightsMap[symbol];

  if (!data || data === "loading") {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono animate-pulse">
          {data === "loading" ? "Loading PDF insights…" : "Preparing…"}
        </p>
      </div>
    );
  }

  if (!data.report) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted text-xs font-mono">No PDF data available</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-3 pr-1">
      {/* Report header */}
      <div className="border border-amber/20 bg-amber/[0.04] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={clsx(
              "text-[9px] font-mono px-1.5 py-0.5 rounded border",
              REPORT_TYPE_COLOR[data.report.reportType] ??
                "text-muted border-border"
            )}
          >
            {data.report.reportType}
          </span>
          <span className="text-[9px] font-mono text-muted">
            {fmtDate(data.report.date)} · {data.report.analyst}
          </span>
        </div>
        <p className="text-xs font-mono text-primary">{data.report.company}</p>
        <p className="text-[9px] font-mono text-muted mt-0.5">
          Showing text extracted from PDF · {data.chunks.length} segments
        </p>
      </div>

      {/* Text chunks */}
      {data.chunks.map((chunk, i) => (
        <div
          key={i}
          className="border border-border rounded-lg p-3 bg-[#0C0E14]"
        >
          <p className="text-[9px] font-mono text-muted/50 mb-1.5">
            segment {i + 1}
          </p>
          <pre className="text-[11px] font-mono text-primary/80 whitespace-pre-wrap leading-relaxed break-words">
            {chunk.text}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CoverageIntelligence() {
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [filterAnalyst, setFilterAnalyst] = useState(ALL);
  const [filterRating, setFilterRating] = useState(ALL);
  const [earningsMap, setEarningsMap] = useState<
    Record<string, EarningsData | null | "loading">
  >({});
  const [insightsMap, setInsightsMap] = useState<
    Record<string, InsightsData | null | "loading">
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

  // Lazy-load earnings when tab is active
  useEffect(() => {
    if (activeTab !== "earnings" || !selected) return;
    if (selected in earningsMap) return;
    setEarningsMap((prev) => ({ ...prev, [selected]: "loading" }));
    fetch(`/api/earnings/${selected}`)
      .then((r) => (r.ok ? (r.json() as Promise<EarningsData>) : null))
      .then((data) =>
        setEarningsMap((prev) => ({ ...prev, [selected]: data }))
      )
      .catch(() =>
        setEarningsMap((prev) => ({ ...prev, [selected]: null }))
      );
  }, [activeTab, selected, earningsMap]);

  // Load insights
  const loadInsights = useCallback((symbol: string) => {
    setInsightsMap((prev) => ({ ...prev, [symbol]: "loading" }));
    fetch(`/api/coverage/${symbol}`)
      .then((r) => (r.ok ? (r.json() as Promise<InsightsData>) : null))
      .then((data) =>
        setInsightsMap((prev) => ({ ...prev, [symbol]: data }))
      )
      .catch(() =>
        setInsightsMap((prev) => ({ ...prev, [symbol]: null }))
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

  // Build a WatchlistEntry-shaped object for EarningsChart
  const stockForChart = selectedEntry
    ? ({
        symbol: selectedEntry.symbol,
        name: selectedEntry.company,
        sector: "",
        rating: selectedEntry.latestRating,
        targetPrice: selectedEntry.latestTarget || null,
        analyst: selectedEntry.analysts[0] ?? "",
        bseCode: "",
        yahooTicker: `${selectedEntry.symbol}.NS`,
        marketCapBucket: "largecap",
        addedAt: selectedEntry.latestDate,
      } as WatchlistEntry)
    : null;

  // ── Loading skeleton ───────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

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
        {/* ── Left: coverage list ───────────────────────────────────────────── */}
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

        {/* ── Right: detail panel ───────────────────────────────────────────── */}
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
                    { id: "insights", label: "PDF Insights" },
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
                  <OverviewTab entry={selectedEntry} />
                )}

                {activeTab === "reports" && (
                  <ReportsTab entry={selectedEntry} />
                )}

                {activeTab === "earnings" && (
                  <>
                    {earningsMap[selectedEntry.symbol] === "loading" ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-muted font-mono text-sm animate-pulse">
                          Loading {selectedEntry.symbol} earnings…
                        </p>
                      </div>
                    ) : earningsMap[selectedEntry.symbol] &&
                      earningsMap[selectedEntry.symbol] !== "loading" ? (
                      stockForChart && (
                        <EarningsChart
                          stock={stockForChart}
                          earnings={
                            earningsMap[selectedEntry.symbol] as EarningsData
                          }
                          onRefresh={() => {
                            setEarningsMap((prev) => {
                              const n = { ...prev };
                              delete n[selectedEntry.symbol];
                              return n;
                            });
                            setActiveTab("earnings");
                          }}
                        />
                      )
                    ) : earningsMap[selectedEntry.symbol] === null ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-muted font-mono text-sm">
                          No Yahoo Finance earnings data for{" "}
                          {selectedEntry.symbol}
                        </p>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-muted font-mono text-sm mb-3">
                            Earnings data not loaded yet
                          </p>
                          <button
                            onClick={() =>
                              setActiveTab("earnings")
                            }
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber border border-amber/30 rounded hover:bg-amber/10 transition-colors mx-auto"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Load earnings
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "insights" && (
                  <InsightsTab
                    symbol={selectedEntry.symbol}
                    insightsMap={insightsMap}
                    onLoad={loadInsights}
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
