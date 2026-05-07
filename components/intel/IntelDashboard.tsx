"use client";

import { useState, useEffect, useCallback } from "react";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import { IntelHeader } from "./IntelHeader";
import { FiltersBar, type IntelFilters } from "./FiltersBar";
import { ClaimsTable } from "./ClaimsTable";
import { StatusBadge } from "./StatusBadge";
import type { CompanySummary } from "@/app/api/intel/companies/route";
import type { EnrichedClaim } from "./ClaimRow";

interface IntelData {
  symbol: string;
  sector: string;
  model: string;
  generatedAt: string;
  hasChecks: boolean;
  hasFundamentals: boolean;
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
  const [filters, setFilters] = useState<IntelFilters>({
    quarter: null, status: "all", segment: null, metric: null, search: "",
  });

  // Load company list
  useEffect(() => {
    fetch("/api/intel/companies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  // Load selected company data — also reset filters so segment list updates correctly
  const loadSymbol = useCallback((sym: string) => {
    setFilters({ quarter: null, status: "all", segment: null, metric: null, search: "" });
    setLoading(true);
    setError(null);
    fetch(`/api/intel/${sym}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({ error: "unknown" }));
          throw new Error(e.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<IntelData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { loadSymbol(selectedSymbol); }, [selectedSymbol, loadSymbol]);

  const company = companies.find((c) => c.symbol === selectedSymbol) ?? null;
  const allQuarters = data ? sortQuarters(Object.keys(data.byQuarter)) : [];

  return (
    <div className="space-y-6">
      {/* Symbol selector row */}
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <button
            key={c.symbol}
            onClick={() => setSelectedSymbol(c.symbol)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono transition-colors ${
              c.symbol === selectedSymbol
                ? "border-amber/50 bg-amber/10 text-amber"
                : "border-border bg-surface text-muted hover:text-primary hover:border-border/70"
            }`}
          >
            {c.symbol}
            {c.totalClaims > 0 && (
              <span className="text-[10px] text-muted">{c.totalClaims}</span>
            )}
          </button>
        ))}
      </div>

      {/* Header */}
      <IntelHeader company={company} symbol={selectedSymbol} />

      {/* Pipeline status row */}
      {data && (
        <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
          <span>model: <span className="text-primary">{data.model}</span></span>
          <span>·</span>
          <span>fundamentals: <span className={data.hasFundamentals ? "text-teal" : "text-danger"}>
            {data.hasFundamentals ? "✓" : "missing"}
          </span></span>
          <span>·</span>
          <span>cross-checks: <span className={data.hasChecks ? "text-teal" : "text-amber"}>
            {data.hasChecks ? "✓" : "pending"}
          </span></span>
          {data.generatedAt && (
            <>
              <span>·</span>
              <span>extracted: <span className="text-primary">{new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span></span>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      {data && !loading && (
        <FiltersBar
          filters={filters}
          quarters={allQuarters}
          metrics={data.registry}
          onChange={setFilters}
        />
      )}

      {/* Main content */}
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
        <ClaimsTable byQuarter={data.byQuarter} filters={filters} registry={data.registry} />
      )}

      {/* Warnings (collapsed) */}
      {data && data.warnings.length > 0 && (
        <details className="text-[11px] font-mono text-muted">
          <summary className="cursor-pointer hover:text-primary">
            {data.warnings.length} pipeline warning{data.warnings.length !== 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-0.5 pl-4">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
