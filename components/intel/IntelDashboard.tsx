"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import { IntelMatrix } from "./IntelMatrix";
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
  const [summaries, setSummaries] = useState<Record<string, QuarterSummary | null>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);

  // Load company list
  useEffect(() => {
    fetch("/api/intel/companies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  // Load symbol data + all summaries in parallel
  const loadSymbol = useCallback((sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setSummaries({});

    fetch(`/api/intel/${sym}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({ error: "unknown" }));
          throw new Error(e.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<IntelData>;
      })
      .then(async (d) => {
        setData(d);
        setLoading(false);

        // Fetch all summaries in parallel
        const quarters = Object.keys(d.byQuarter);
        setSummariesLoading(true);
        const results = await Promise.allSettled(
          quarters.map(async (q) => {
            const res = await fetch(`/api/intel/${sym}/summaries/${q}`);
            const json = await res.json() as QuarterSummary | { pending: boolean };
            return { q, summary: "pending" in json ? null : (json as QuarterSummary) };
          })
        );
        const map: Record<string, QuarterSummary | null> = {};
        for (const r of results) {
          if (r.status === "fulfilled") map[r.value.q] = r.value.summary;
        }
        setSummaries(map);
        setSummariesLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { loadSymbol(selectedSymbol); }, [selectedSymbol, loadSymbol]);

  // Quarters sorted newest-first (matrix columns left → right)
  const sortedQuarters = useMemo(() => {
    if (!data) return [];
    return [...sortQuarters(Object.keys(data.byQuarter))].reverse();
  }, [data]);

  // Unique segments in appearance order
  const segments = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const q of sortQuarters(Object.keys(data.byQuarter))) {
      for (const claim of data.byQuarter[q] ?? []) {
        const seg = data.registry.find((r) => r.key === claim.metricKey)?.segment;
        if (seg && !seen.has(seg)) { seen.add(seg); order.push(seg); }
      }
    }
    return order;
  }, [data]);

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
                  isSelected     ? "text-teal"
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
          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted">
            <span>{data.model}</span>
            {summariesLoading && <span className="text-amber/60">loading summaries…</span>}
            {!data.hasChecks && (
              <><span>·</span><span className="text-amber">cross-checks pending</span></>
            )}
          </div>

          <IntelMatrix
            quarters={sortedQuarters}
            summaries={summaries}
            segments={segments}
            byQuarter={data.byQuarter}
            registry={data.registry}
          />

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
