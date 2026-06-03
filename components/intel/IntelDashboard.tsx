"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { TranscriptUpload } from "./TranscriptUpload";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
import { IntelMatrix } from "./IntelMatrix";
import type { CompanySummary } from "@/app/api/intel/companies/route";
import type { EnrichedClaim } from "./ClaimRow";
import type { QuarterSummary } from "@/lib/intel/types";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

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
const MAX_COLUMNS = 6;

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

// ── Sector dropdown ───────────────────────────────────────────────────────────

function SectorDropdown({
  selectedSector,
  sectorStats,
  onChange,
}: {
  selectedSector: string;
  sectorStats: Array<{ sector: string; count: number; pct: number | null }>;
  onChange: (sector: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const current = sectorStats.find((s) => s.sector === selectedSector);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-surface text-xs font-mono text-primary hover:border-amber/40 transition-colors"
      >
        <span className="text-muted/60 shrink-0 text-[10px] uppercase tracking-wider">Sector</span>
        <span className="font-bold">{SECTOR_LABELS[selectedSector] ?? selectedSector}</span>
        <span className="text-muted/40">·</span>
        <span className="text-muted/60">{current?.count ?? 0}</span>
        {current?.pct != null && (
          <span className={`font-bold ${
            current.pct >= 70 ? "text-teal" : current.pct >= 40 ? "text-amber" : "text-danger"
          }`}>
            {current.pct}%
          </span>
        )}
        <ChevronDown size={11} className="text-muted/50 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            className="absolute top-full left-0 mt-1 z-20 w-64 rounded border border-border bg-surface shadow-lg overflow-y-auto max-h-[70vh]"
          >
            {sectorStats.map(({ sector, count, pct }) => {
              const isActive = sector === selectedSector;
              return (
                <button
                  key={sector}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { onChange(sector); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono transition-colors ${
                    isActive ? "bg-amber/10" : "hover:bg-base/60"
                  }`}
                >
                  {/* Label — no truncate needed; all sector names fit in w-64 */}
                  <span className={`${isActive ? "text-amber" : "text-primary"}`}>
                    {SECTOR_LABELS[sector] ?? sector}
                  </span>
                  {/* Count + pct grouped on the right */}
                  <span className="flex items-center gap-1.5 shrink-0 ml-3">
                    <span className={`text-[10px] tabular-nums ${isActive ? "text-amber/60" : "text-muted"}`}>
                      {count}
                    </span>
                    {pct != null && (
                      <span className={`text-[10px] font-bold tabular-nums ${
                        pct >= 70 ? "text-teal" : pct >= 40 ? "text-amber" : "text-danger"
                      }`}>
                        {pct}%
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
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
  const [selectedSector, setSelectedSector] = useState<string>(
    () => SYMBOL_SECTOR[DEFAULT_SYMBOL] ?? SECTOR_DISPLAY_ORDER[0]
  );

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
    setShowAllQuarters(false); // collapse to 4-quarter default on symbol switch

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

  // Sync selected sector when symbol changes externally
  useEffect(() => {
    const s = SYMBOL_SECTOR[selectedSymbol];
    if (s) setSelectedSector(s);
  }, [selectedSymbol]);

  // All quarters with any claims, newest-first.
  // Includes pending/unverified quarters — Stage 4 uses later transcripts to
  // verify earlier claims, so pending quarters belong in the same compare view.
  const allQuarters = useMemo(() => {
    if (!data) return [];
    return [...sortQuarters(Object.keys(data.byQuarter))].reverse()
      .filter((q) => (data.byQuarter[q] ?? []).length > 0);
  }, [data]);

  // Which quarters have at least one decisive verdict (met/moving/miss)
  const verifiedSet = useMemo(() => {
    if (!data) return new Set<string>();
    const s = new Set<string>();
    for (const [q, claims] of Object.entries(data.byQuarter)) {
      if (claims.some((c) => {
        const v = c.check?.verdict;
        return v && v !== "pending" && v !== "ambiguous";
      })) s.add(q);
    }
    return s;
  }, [data]);

  // Visible picker list — default MAX_COLUMNS most recent, expanded by user toggle.
  const sortedQuarters = useMemo(
    () => (showAllQuarters ? allQuarters : allQuarters.slice(0, MAX_COLUMNS)),
    [allQuarters, showAllQuarters]
  );

  // Auto-select up to 4 most recent quarters on symbol switch
  useEffect(() => {
    setSelectedQuarters((current) =>
      current.length === 0 && sortedQuarters.length > 0
        ? sortedQuarters.slice(0, Math.min(4, sortedQuarters.length))
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
        (a, b) => allQuarters.indexOf(a) - allQuarters.indexOf(b)
      );
    });
  };


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

  const sectorCompanies = useMemo(
    () => companies.filter((c) => c.sector === selectedSector),
    [companies, selectedSector]
  );

  const sectorStats = useMemo(
    () =>
      SECTOR_DISPLAY_ORDER
        .filter((s) => companies.some((c) => c.sector === s))
        .map((s) => {
          const cos = companies.filter((c) => c.sector === s);
          const dec = cos.reduce((a, c) => a + c.metCount + c.movingCount + c.missCount, 0);
          const ot  = cos.reduce((a, c) => a + c.metCount + c.movingCount, 0);
          return {
            sector: s,
            count: cos.length,
            pct: dec > 0 ? Math.round((ot / dec) * 100) : null,
          };
        }),
    [companies]
  );

  return (
    <div className="space-y-4">

      {/* ── Company selector: sector dropdown + inline chips ── */}
      <div className="flex flex-wrap items-center gap-2">
        <TranscriptUpload onComplete={() => loadSymbol(selectedSymbol)} />
        <SectorDropdown
          selectedSector={selectedSector}
          sectorStats={sectorStats}
          onChange={setSelectedSector}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {sectorCompanies.map((c) => (
            <CompanyChip
              key={c.symbol}
              company={c}
              selectedSymbol={selectedSymbol}
              onSelect={setSelectedSymbol}
            />
          ))}
        </div>
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
              const isVerified = verifiedSet.has(q);
              return (
                <button
                  key={q}
                  onClick={() => toggleQuarter(q)}
                  disabled={atMax}
                  title={
                    atMax          ? `Max ${MAX_COLUMNS} columns`
                    : !isVerified  ? "Pending verification — claims extracted, cross-check not yet run"
                    : undefined
                  }
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    isActive
                      ? "border border-amber/50 bg-amber/10 text-amber"
                      : atMax
                      ? "border border-border/20 text-muted/25 cursor-not-allowed"
                      : isVerified
                      ? "border border-border bg-surface text-muted hover:text-primary hover:border-amber/30"
                      : "border border-dashed border-amber/30 bg-surface/50 text-muted/70 hover:text-primary hover:border-amber/50"
                  }`}
                >
                  {quarterDisplay(q)}
                  {!isVerified && !isActive && (
                    <span className="ml-1 text-[9px] text-amber/50">●</span>
                  )}
                </button>
              );
            })}

            {/* Expand / collapse older quarters */}
            {allQuarters.length > MAX_COLUMNS && (
              <button
                onClick={() => setShowAllQuarters((p) => !p)}
                className="px-2 py-1 text-[10px] font-mono text-muted/60 hover:text-primary border border-border/30 hover:border-border/60 rounded transition-colors"
              >
                {showAllQuarters
                  ? "show less"
                  : `+${allQuarters.length - MAX_COLUMNS} older`}
              </button>
            )}

            <span className="text-[10px] font-mono text-muted/40 ml-1">
              {selectedQuarters.length}/{MAX_COLUMNS} cols
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
