"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Clock, Search } from "lucide-react";
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

// ── Sector display config ────────────────────────────────────────────────────

const SECTOR_DISPLAY_ORDER = [
  "bank", "nbfc", "insurance-holding", "insurance-life", "financial-services",
  "it-services", "pharma", "auto", "fmcg", "oil-gas-energy",
  "metals-mining", "power-utilities", "telecom", "cement-building",
  "capital-goods-infra", "defence", "consumer-retail", "aviation", "real-estate",
] as const;

const SECTOR_LABELS: Record<string, string> = {
  "bank":                "Banking",
  "nbfc":                "NBFC & Lending",
  "insurance-holding":   "Insurance — Holding",
  "insurance-life":      "Insurance — Life",
  "financial-services":  "Financial Services",
  "it-services":         "IT Services",
  "pharma":              "Pharma & Healthcare",
  "auto":                "Auto & Ancillaries",
  "fmcg":                "FMCG",
  "oil-gas-energy":      "Oil, Gas & Energy",
  "metals-mining":       "Metals & Mining",
  "power-utilities":     "Power & Utilities",
  "telecom":             "Telecom",
  "cement-building":     "Cement & Building Materials",
  "capital-goods-infra": "Capital Goods & Infra",
  "defence":             "Defence",
  "consumer-retail":     "Consumer & Retail",
  "aviation":            "Aviation",
  "real-estate":         "Real Estate",
};

// ── Company chip ─────────────────────────────────────────────────────────────

function CompanyChip({
  company,
  selectedSymbol,
  onSelect,
}: {
  company: CompanySummary;
  selectedSymbol: string;
  onSelect: (sym: string) => void;
}) {
  const isSelected = company.symbol === selectedSymbol;
  const decisive = company.metCount + company.movingCount + company.missCount;
  const onTrackPct = decisive > 0
    ? Math.round(((company.metCount + company.movingCount) / decisive) * 100)
    : null;
  const hasData = company.totalClaims > 0;

  return (
    <button
      onClick={() => onSelect(company.symbol)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-xs transition-colors ${
        isSelected
          ? "border-amber/50 bg-amber/10 text-amber"
          : hasData
          ? "border-border bg-surface text-muted hover:text-primary hover:border-border/60"
          : "border-border/30 bg-surface/30 text-muted/40 hover:text-muted hover:border-border/40"
      }`}
    >
      <span className="font-bold text-[11px]">{company.symbol}</span>
      {hasData && (
        <span className={`text-[10px] ${isSelected ? "text-amber/70" : "text-muted/60"}`}>
          {company.totalClaims}
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
}

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
  const [showAllQuarters, setShowAllQuarters] = useState(false);
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Load company list
  useEffect(() => {
    fetch("/api/intel/companies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  // Auto-open sectors that have any claims data once companies load
  useEffect(() => {
    if (companies.length === 0) return;
    const withData = new Set(companies.filter((c) => c.totalClaims > 0).map((c) => c.sector));
    setOpenSectors(withData);
  }, [companies]);

  // Load symbol data + all summaries in parallel
  const loadSymbol = useCallback((sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setSummaries({});
    setSelectedQuarters([]); // reset; auto-picked once quarters load
    setShowAllQuarters(false); // collapse to 4-quarter default on symbol switch
    setSearchQuery("");

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

  // All verified quarters newest-first — full history, no cap.
  const allVerifiedQuarters = useMemo(() => {
    if (!data) return [];
    const all = [...sortQuarters(Object.keys(data.byQuarter))].reverse();
    return all.filter((q) => {
      const claims = data.byQuarter[q] ?? [];
      if (claims.length === 0) return false;
      return claims.some((c) => {
        const v = c.check?.verdict;
        return v && v !== "pending" && v !== "ambiguous";
      });
    });
  }, [data]);

  // Visible picker list — default 4 most recent, expanded by user toggle.
  const sortedQuarters = useMemo(
    () => (showAllQuarters ? allVerifiedQuarters : allVerifiedQuarters.slice(0, 4)),
    [allVerifiedQuarters, showAllQuarters]
  );

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
      // Maintain newest-first order (use full list so old quarters sort correctly)
      return [...prev, q].sort(
        (a, b) => allVerifiedQuarters.indexOf(a) - allVerifiedQuarters.indexOf(b)
      );
    });
  };

  // Quarters with claims but no verified data — shown as "Latest Guidance".
  // Only includes quarters NEWER than the most recent verified quarter so that
  // old unprocessed quarters (pre-pipeline) don't bleed in here.
  const pendingQuarters = useMemo(() => {
    if (!data) return [];
    const all = [...sortQuarters(Object.keys(data.byQuarter))].reverse(); // newest-first

    // Compute ordinal (FY * 4 + quarter) for chronological comparison
    const ordinal = (q: string) => parseInt(q.slice(5)) * 4 + parseInt(q[1]);
    const newestVerifiedOrdinal = allVerifiedQuarters.length > 0 ? ordinal(allVerifiedQuarters[0]) : -1;

    return all.filter((q) => {
      const claims = data.byQuarter[q] ?? [];
      if (claims.length === 0) return false;
      // Must be strictly newer than the most recent verified quarter
      if (ordinal(q) <= newestVerifiedOrdinal) return false;
      // Quarter is "latest guidance" if NO claim has a decisive verdict
      return !claims.some((c) => {
        const v = c.check?.verdict;
        return v && v !== "pending" && v !== "ambiguous";
      });
    });
  }, [data, allVerifiedQuarters]);

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

  // Group companies by sector for the accordion
  const companiesBySector = useMemo(() => {
    const map = new Map<string, CompanySummary[]>();
    for (const c of companies) {
      if (!map.has(c.sector)) map.set(c.sector, []);
      map.get(c.sector)!.push(c);
    }
    return map;
  }, [companies]);

  // Search: flat filtered list (active only when query is non-empty)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => c.symbol.toLowerCase().includes(q));
  }, [companies, searchQuery]);

  return (
    <div className="space-y-4">

      {/* ── Company selector: search + sector accordion ── */}
      <div className="space-y-2">
        {/* Upload + Search row */}
        <div className="flex items-center gap-2">
          <TranscriptUpload onComplete={() => loadSymbol(selectedSymbol)} />
          <div className="relative max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-primary placeholder:text-muted/40 focus:outline-none focus:border-amber/40"
            />
          </div>
        </div>

        {/* Search results: flat chips */}
        {searchQuery.trim() && (
          <div className="flex flex-wrap gap-1.5 px-0.5 py-1">
            {searchResults.length === 0 ? (
              <span className="text-[11px] font-mono text-muted/60">No match for &ldquo;{searchQuery}&rdquo;</span>
            ) : (
              searchResults.map((c) => (
                <CompanyChip key={c.symbol} company={c} selectedSymbol={selectedSymbol}
                  onSelect={(s) => { setSelectedSymbol(s); setSearchQuery(""); }} />
              ))
            )}
          </div>
        )}

        {/* Sector accordion (hidden while searching) */}
        {!searchQuery.trim() && (
          <div className="border border-border rounded overflow-hidden divide-y divide-border/60">
            {SECTOR_DISPLAY_ORDER.map((sector) => {
              const sectorCos = companiesBySector.get(sector) ?? [];
              if (sectorCos.length === 0) return null;
              const isOpen = openSectors.has(sector);
              const totalClaims = sectorCos.reduce((s, c) => s + c.totalClaims, 0);
              const decisive = sectorCos.reduce((s, c) => s + c.metCount + c.movingCount + c.missCount, 0);
              const onTrack = sectorCos.reduce((s, c) => s + c.metCount + c.movingCount, 0);
              const onTrackPct = decisive > 0 ? Math.round((onTrack / decisive) * 100) : null;

              return (
                <div key={sector}>
                  <button
                    onClick={() =>
                      setOpenSectors((prev) => {
                        const next = new Set(prev);
                        if (next.has(sector)) next.delete(sector); else next.add(sector);
                        return next;
                      })
                    }
                    className="w-full flex items-center gap-3 px-4 py-2 bg-surface hover:bg-surface/70 text-left transition-colors"
                  >
                    <span className="text-[11px] font-mono font-bold text-primary w-44 truncate">
                      {SECTOR_LABELS[sector] ?? sector}
                    </span>
                    <span className="text-[10px] font-mono text-muted/60">
                      {sectorCos.length} stocks
                    </span>
                    {totalClaims > 0 && (
                      <span className="text-[10px] font-mono text-muted/50">· {totalClaims} claims</span>
                    )}
                    {onTrackPct !== null && (
                      <span className={`ml-auto mr-2 text-[10px] font-mono font-bold ${
                        onTrackPct >= 70 ? "text-teal" : onTrackPct >= 40 ? "text-amber" : "text-danger"
                      }`}>
                        {onTrackPct}%
                      </span>
                    )}
                    <span className="text-muted/50 shrink-0">
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 py-2 bg-base/30 flex flex-wrap gap-1.5">
                      {sectorCos.map((c) => (
                        <CompanyChip key={c.symbol} company={c} selectedSymbol={selectedSymbol}
                          onSelect={setSelectedSymbol} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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

            {/* Expand / collapse older quarters */}
            {allVerifiedQuarters.length > 4 && (
              <button
                onClick={() => setShowAllQuarters((p) => !p)}
                className="px-2 py-1 text-[10px] font-mono text-muted/60 hover:text-primary border border-border/30 hover:border-border/60 rounded transition-colors"
              >
                {showAllQuarters
                  ? "show less"
                  : `+${allVerifiedQuarters.length - 4} older`}
              </button>
            )}

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
