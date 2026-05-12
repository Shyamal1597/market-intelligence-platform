"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import { QuarterTimeline, type QuarterMeta } from "./QuarterTimeline";
import { QuarterHeadline } from "./QuarterHeadline";
import { SegmentCard } from "./SegmentCard";
import type { CompanySummary } from "@/app/api/intel/companies/route";
import type { EnrichedClaim } from "./ClaimRow";
import type { QuarterSummary } from "@/lib/intel/types";

interface IntelData {
  symbol: string;
  sector: string;
  model: string;
  generatedAt: string;
  hasChecks: boolean;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  byQuarter: Record<string, EnrichedClaim[]>;
  warnings: string[];
}

const DEFAULT_SYMBOL = "BAJAJFINSV";

export function IntelDashboard() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Summary state — loaded per-quarter
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [summary, setSummary] = useState<QuarterSummary | null>(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Summary cache — avoid refetching same quarter
  const [summaryCache, setSummaryCache] = useState<Record<string, QuarterSummary | "pending">>({});

  // Load company list
  useEffect(() => {
    fetch("/api/intel/companies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  // Load selected company data
  const loadSymbol = useCallback((sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setSummary(null);
    setSummaryCache({});
    setSelectedQuarter("");
    fetch(`/api/intel/${sym}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({ error: "unknown" }));
          throw new Error(e.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<IntelData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
        // Auto-select most recent quarter
        const quarters = sortQuarters(Object.keys(d.byQuarter));
        if (quarters.length > 0) setSelectedQuarter(quarters[quarters.length - 1]);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { loadSymbol(selectedSymbol); }, [selectedSymbol, loadSymbol]);

  // Load summary when quarter changes
  const loadSummary = useCallback((sym: string, quarter: string, cache: Record<string, QuarterSummary | "pending">) => {
    if (!quarter) return;
    const cached = cache[quarter];
    if (cached === "pending") { setSummary(null); setSummaryPending(true); return; }
    if (cached) { setSummary(cached as QuarterSummary); setSummaryPending(false); return; }

    setSummaryLoading(true);
    setSummary(null);
    setSummaryPending(false);

    fetch(`/api/intel/${sym}/summaries/${quarter}`)
      .then((r) => r.json())
      .then((d: QuarterSummary | { pending: boolean }) => {
        setSummaryLoading(false);
        if ("pending" in d && d.pending) {
          setSummaryPending(true);
          setSummaryCache((prev) => ({ ...prev, [quarter]: "pending" }));
        } else {
          const s = d as QuarterSummary;
          setSummary(s);
          setSummaryCache((prev) => ({ ...prev, [quarter]: s }));
        }
      })
      .catch(() => { setSummaryLoading(false); setSummaryPending(true); });
  }, []);

  useEffect(() => {
    if (selectedSymbol && selectedQuarter) {
      loadSummary(selectedSymbol, selectedQuarter, summaryCache);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedQuarter]);

  // Build timeline metadata
  const timelineQuarters = useMemo((): QuarterMeta[] => {
    if (!data) return [];
    return sortQuarters(Object.keys(data.byQuarter)).map((q) => {
      const cached = summaryCache[q];
      if (cached && cached !== "pending") {
        return { quarter: q, onTrackPct: (cached as QuarterSummary).onTrackPct, hasSummary: true };
      }
      return { quarter: q, onTrackPct: null, hasSummary: false };
    });
  }, [data, summaryCache]);

  // Claims for selected quarter, grouped by segment
  const claimsBySegment = useMemo((): Record<string, EnrichedClaim[]> => {
    if (!data || !selectedQuarter) return {};
    const claims = data.byQuarter[selectedQuarter] ?? [];
    return claims.reduce<Record<string, EnrichedClaim[]>>((acc, c) => {
      const seg = data.registry.find((r) => r.key === c.metricKey)?.segment ?? "Other";
      (acc[seg] ??= []).push(c);
      return acc;
    }, {});
  }, [data, selectedQuarter]);

  return (
    <div className="space-y-5">
      {/* Company selector */}
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => {
          const isSelected = c.symbol === selectedSymbol;
          const decisive = c.metCount + c.movingCount + c.missCount;
          const onTrackPct = decisive > 0
            ? Math.round(((c.metCount + c.movingCount) / decisive) * 100)
            : null;
          return (
            <button
              key={c.symbol}
              onClick={() => setSelectedSymbol(c.symbol)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded border font-mono transition-colors ${
                isSelected
                  ? "border-amber/50 bg-amber/10 text-amber"
                  : "border-border bg-surface text-muted hover:text-primary hover:border-border/60"
              }`}
            >
              <span className="text-xs font-bold">{c.symbol}</span>
              {c.totalClaims > 0 && (
                <span className={`text-[10px] ${isSelected ? "text-amber/70" : "text-muted"}`}>
                  {c.totalClaims} claims
                </span>
              )}
              {onTrackPct !== null && (
                <span className={`text-[10px] font-bold ${
                  isSelected ? "text-teal"
                  : onTrackPct >= 70 ? "text-teal"
                  : onTrackPct >= 40 ? "text-amber"
                  : "text-danger"
                }`}>
                  {onTrackPct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm animate-pulse">
          Loading intel data…
        </div>
      )}
      {!loading && error && (
        <div className="rounded border border-danger/25 bg-danger/5 p-6 text-center">
          <p className="text-danger font-mono text-sm">{error}</p>
          <p className="text-muted font-sans text-xs mt-2">
            Run <code className="text-amber">npm run intel:rebuild {selectedSymbol}</code> to generate data.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Pipeline meta */}
          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted">
            <span>{data.model}</span>
            {!data.hasChecks && <><span>·</span><span className="text-amber">cross-checks pending</span></>}
          </div>

          {/* Timeline strip */}
          <QuarterTimeline
            quarters={timelineQuarters}
            selectedQuarter={selectedQuarter}
            onSelect={setSelectedQuarter}
          />

          {/* Headline for selected quarter */}
          <QuarterHeadline
            summary={summary}
            pending={summaryPending}
            loading={summaryLoading}
            sourceQuarter={selectedQuarter}
            symbol={selectedSymbol}
          />

          {/* Segment cards */}
          {selectedQuarter && Object.keys(claimsBySegment).length > 0 && (
            <div className="space-y-3">
              {Object.entries(claimsBySegment).map(([seg, segClaims]) => (
                <SegmentCard
                  key={seg}
                  segment={seg}
                  note={summary?.segments[seg] ?? null}
                  claims={segClaims}
                  byQuarter={data.byQuarter}
                  sourceQuarter={selectedQuarter}
                  registry={data.registry}
                />
              ))}
            </div>
          )}

          {/* Pipeline warnings */}
          {data.warnings.length > 0 && (
            <details className="text-[11px] font-mono text-muted">
              <summary className="cursor-pointer hover:text-primary">
                {data.warnings.length} pipeline warning{data.warnings.length !== 1 ? "s" : ""}
              </summary>
              <ul className="mt-2 space-y-0.5 pl-4">
                {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
