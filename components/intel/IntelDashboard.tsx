"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { TranscriptUpload } from "./TranscriptUpload";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
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
  segmentDescriptions: Record<string, string>;
  byQuarter: Record<string, EnrichedClaim[]>;
  warnings: string[];
}

const DEFAULT_SYMBOL = "BAJAJFINSV";
const MAX_COLUMNS = 4;

// ── Latest Guidance (unverified forward-looking claims) ──────────────────────

function LatestGuidanceSection({
  quarters,
  byQuarter,
  registry,
}: {
  quarters: string[];
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-surface hover:bg-surface/70 text-left transition-colors"
      >
        <Clock className="w-3.5 h-3.5 text-amber/70 shrink-0" />
        <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
          Latest Guidance
        </span>
        <span className="text-[10px] font-mono text-muted">
          {quarters.map((q) => quarterDisplay(q)).join(", ")}
        </span>
        <span className="ml-auto text-muted">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/40">
          {/* Explanation */}
          <div className="px-5 py-3 bg-amber/[0.03] border-b border-border/30">
            <p className="text-xs font-sans text-muted leading-relaxed">
              Forward-looking statements from the most recent earnings call.
              These claims have no target quarter yet — verification begins once the
              next quarter&apos;s transcript is available and cross-checked.
            </p>
          </div>

          {/* Claims grouped by quarter */}
          {quarters.map((q) => {
            const claims = byQuarter[q] ?? [];
            if (claims.length === 0) return null;
            return (
              <div key={q} className="px-5 py-4 border-b border-border/30 last:border-b-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono font-bold text-amber tracking-wide">
                    {quarterDisplay(q)}
                  </span>
                  <span className="text-[10px] font-mono text-muted">
                    {claims.length} claim{claims.length !== 1 ? "s" : ""} · all pending verification
                  </span>
                </div>
                <div className="space-y-2">
                  {claims.map((c) => {
                    const metric = registry.find((r) => r.key === c.metricKey);
                    return (
                      <div
                        key={c.id}
                        className="flex items-start gap-4 py-2 border-l-2 border-border pl-3"
                      >
                        <span className="shrink-0 text-[11px] font-mono text-amber/80 w-36 truncate" title={metric?.label}>
                          {metric?.label ?? c.metricKey}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-sans text-primary/80 leading-relaxed line-clamp-2">
                            &ldquo;{c.quote}&rdquo;
                          </p>
                          {c.speaker && (
                            <span className="text-[10px] font-mono text-muted mt-0.5 block">— {c.speaker}</span>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] font-mono text-muted/60 border border-border/50 px-1.5 py-0.5 rounded">
                          PENDING
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IntelDashboard() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, QuarterSummary | null>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);

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
    setSelectedQuarters([]); // reset; auto-picked once quarters load

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

  // Quarters sorted newest-first, excluding quarters with no verified claims
  const sortedQuarters = useMemo(() => {
    if (!data) return [];
    const all = [...sortQuarters(Object.keys(data.byQuarter))].reverse();
    // Hide quarters where every claim is unverified (pending/ambiguous/null check)
    return all.filter((q) => {
      const claims = data.byQuarter[q] ?? [];
      if (claims.length === 0) return false;
      return claims.some((c) => {
        const v = c.check?.verdict;
        return v && v !== "pending" && v !== "ambiguous";
      });
    });
  }, [data]);

  // Auto-select 2 most recent once quarters are available (after a symbol switch)
  useEffect(() => {
    setSelectedQuarters((current) =>
      current.length === 0 && sortedQuarters.length > 0
        ? sortedQuarters.slice(0, 2)
        : current
    );
  }, [sortedQuarters]);

  const toggleQuarter = (q: string) => {
    setSelectedQuarters((prev) => {
      if (prev.includes(q)) {
        // Always keep at least 1 column selected
        return prev.length > 1 ? prev.filter((x) => x !== q) : prev;
      }
      if (prev.length >= MAX_COLUMNS) return prev; // cap reached
      // Maintain newest-first order
      return [...prev, q].sort(
        (a, b) => sortedQuarters.indexOf(a) - sortedQuarters.indexOf(b)
      );
    });
  };

  // Quarters with claims but no verified data (forward-looking only)
  const pendingQuarters = useMemo(() => {
    if (!data) return [];
    const all = [...sortQuarters(Object.keys(data.byQuarter))].reverse();
    return all.filter((q) => {
      const claims = data.byQuarter[q] ?? [];
      if (claims.length === 0) return false;
      // Quarter is "pending" if NO claim has a decisive verdict
      return !claims.some((c) => {
        const v = c.check?.verdict;
        return v && v !== "pending" && v !== "ambiguous";
      });
    });
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
    <div className="space-y-4">

      {/* ── Company selector + Upload ── */}
      <div className="flex flex-wrap items-center gap-2">
        <TranscriptUpload onComplete={() => loadSymbol(selectedSymbol)} />
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
                  isSelected        ? "text-teal"
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
          {/* ── Quarter picker ── */}
          <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-border/40">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest shrink-0">
              Compare
            </span>

            {sortedQuarters.map((q) => {
              const isActive = selectedQuarters.includes(q);
              const atMax = !isActive && selectedQuarters.length >= MAX_COLUMNS;
              return (
                <button
                  key={q}
                  onClick={() => toggleQuarter(q)}
                  disabled={atMax}
                  title={atMax ? `Max ${MAX_COLUMNS} columns` : undefined}
                  className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                    isActive
                      ? "border-amber/50 bg-amber/10 text-amber"
                      : atMax
                      ? "border-border/20 text-muted/25 cursor-not-allowed"
                      : "border-border bg-surface text-muted hover:text-primary hover:border-amber/30"
                  }`}
                >
                  {quarterDisplay(q)}
                </button>
              );
            })}

            <span className="text-[10px] font-mono text-muted/40 ml-1">
              {selectedQuarters.length}/{MAX_COLUMNS} shown
            </span>

            {summariesLoading && (
              <span className="text-[10px] font-mono text-amber/50 ml-auto">
                loading summaries…
              </span>
            )}
          </div>

          {/* ── Meta line ── */}
          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted">
            <span>{data.model}</span>
            {!data.hasChecks && (
              <><span>·</span><span className="text-amber">cross-checks pending</span></>
            )}
          </div>

          <IntelMatrix
            quarters={selectedQuarters}
            summaries={summaries}
            segments={segments}
            byQuarter={data.byQuarter}
            registry={data.registry}
            segmentDescriptions={data.segmentDescriptions}
          />

          {/* ── Latest guidance (unverified quarters) ── */}
          {pendingQuarters.length > 0 && (
            <LatestGuidanceSection
              quarters={pendingQuarters}
              byQuarter={data.byQuarter}
              registry={data.registry}
            />
          )}

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
