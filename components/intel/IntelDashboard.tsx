"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { TranscriptUpload } from "./TranscriptUpload";
import { GuidanceTimeline } from "./GuidanceTimeline";
import { CompanySummaryBar } from "./CompanySummaryBar";
import { KPITracker } from "./KPITracker";
import { DataQualityBanner } from "./DataQualityBanner";
import type { CompanySummary } from "@/app/api/intel/companies/route";
import type { EnrichedClaim } from "./ClaimRow";
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

// -- Sector display config ----------------------------------------------------

const SECTOR_DISPLAY_ORDER = [
  "bank", "nbfc", "insurance-holding", "insurance-life", "financial-services",
  "it-services", "pharma", "auto", "fmcg", "oil-gas-energy",
  "metals-mining", "power-utilities", "telecom", "cement-building",
  "capital-goods-infra", "defence", "consumer-retail", "aviation", "real-estate",
] as const;

const SECTOR_LABELS: Record<string, string> = {
  "bank":                "Banking",
  "nbfc":                "NBFC & Lending",
  "insurance-holding":   "Insurance -- Holding",
  "insurance-life":      "Insurance -- Life",
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

// -- Company chip -------------------------------------------------------------

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
  const hasData = company.totalClaims > 0;
  const dq = company.dataQuality;
  const hasError = dq?.notes.some(n => n.severity === "error");
  const hasWarn  = dq?.notes.some(n => n.severity === "warn");

  return (
    <button
      onClick={() => onSelect(company.symbol)}
      title={dq?.hasIssues ? dq.notes.map(n => n.message).join(" · ") : undefined}
      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-xs transition-colors ${
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
      {/* Data quality dot -- top-right corner */}
      {dq?.hasIssues && (
        <span
          className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
            hasError ? "bg-danger" : hasWarn ? "bg-amber" : "bg-muted"
          }`}
        />
      )}
    </button>
  );
}

// -- Sector dropdown -----------------------------------------------------------
// Uses a React Portal so the panel renders directly in <body> -- this breaks
// it out of any parent stacking context or overflow clipping that Tailwind v4
// color-mix() layers can introduce on siblings.

function SectorDropdown({
  selectedSector,
  sectorStats,
  onChange,
}: {
  selectedSector: string;
  sectorStats: Array<{ sector: string; count: number }>;
  onChange: (sector: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = sectorStats.find((s) => s.sector === selectedSector);

  const openPanel = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPanelStyle({
        position: "fixed",
        top: r.bottom + 4,
        left: r.left,
        width: 256,
        zIndex: 9999,
      });
    }
    setOpen(true);
  };

  // Close on scroll / resize so panel doesn't drift
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close, { passive: true });
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const panel = open ? (
    <>
      {/* Invisible backdrop for outside-click dismiss */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={() => setOpen(false)}
      />
      {/* Panel -- rendered at body level, no parent CSS can clip it */}
      <div
        style={panelStyle}
        className="rounded border border-border bg-surface shadow-xl overflow-y-auto"
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        {sectorStats.map(({ sector, count }) => {
          const isActive = sector === selectedSector;
          return (
            <div
              key={sector}
              tabIndex={0}
              onClick={() => { onChange(sector); setOpen(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { onChange(sector); setOpen(false); }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                backgroundColor: isActive ? "color-mix(in oklch, var(--color-amber) 12%, transparent)" : "transparent",
              }}
              className={isActive ? "" : "hover:bg-base/60"}
            >
              <span style={{ color: isActive ? "var(--color-amber)" : "var(--color-primary)" }}>
                {SECTOR_LABELS[sector] ?? sector}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: 12 }}>
                <span style={{
                  fontSize: "10px",
                  color: isActive ? "color-mix(in oklch, var(--color-amber) 60%, transparent)" : "var(--color-muted)",
                }}>
                  {count}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-surface text-xs font-mono text-primary hover:border-amber/40 transition-colors"
      >
        <span className="text-muted/60 shrink-0 text-[10px] uppercase tracking-wider">Sector</span>
        <span className="font-bold">{SECTOR_LABELS[selectedSector] ?? selectedSector}</span>
        <span className="text-muted/40">·</span>
        <span className="text-muted/60">{current?.count ?? 0}</span>
        <ChevronDown size={11} className="text-muted/50 shrink-0" />
      </button>

      {/* Mount panel in <body> via portal */}
      {typeof window !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

export function IntelDashboard() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "kpi">("timeline");
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

  const loadSymbol = useCallback((sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);

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
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { loadSymbol(selectedSymbol); }, [selectedSymbol, loadSymbol]);

  // Sync selected sector when symbol changes externally
  useEffect(() => {
    const s = SYMBOL_SECTOR[selectedSymbol];
    if (s) setSelectedSector(s);
  }, [selectedSymbol]);

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
          return {
            sector: s,
            count: cos.length,
          };
        }),
    [companies]
  );

  return (
    <div className="space-y-4">

      {/* -- Company selector: sector dropdown + inline chips -- */}
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
          {/* Company summary bar */}
          <CompanySummaryBar
            symbol={selectedSymbol}
            sectorLabel={SECTOR_LABELS[selectedSector] ?? selectedSector}
            byQuarter={data.byQuarter}
          />

          {/* View toggle */}
          <div className="flex items-center gap-1 border-b border-border/40 pb-3">
            <button
              onClick={() => setViewMode("timeline")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                viewMode === "timeline"
                  ? "bg-amber/10 text-amber border border-amber/30"
                  : "text-muted hover:text-primary border border-transparent hover:border-border/40"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode("kpi")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                viewMode === "kpi"
                  ? "bg-amber/10 text-amber border border-amber/30"
                  : "text-muted hover:text-primary border border-transparent hover:border-border/40"
              }`}
            >
              KPI Tracker
            </button>
            <span className="text-[10px] font-mono text-muted/35 ml-2">
              {viewMode === "timeline"
                ? "per-call narrative -- each quarter's guidance and outcomes"
                : "guidance narrative -- track each KPI across all calls"}
            </span>
          </div>

          {/* Meta line */}
          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted">
            <span>{data.model}</span>
            {!data.hasChecks && (
              <><span>·</span><span className="text-amber">cross-checks pending</span></>
            )}
          </div>

          {/* Main view */}
          {viewMode === "timeline" ? (
            <GuidanceTimeline
              byQuarter={data.byQuarter}
              registry={data.registry}
              segmentDescriptions={data.segmentDescriptions}
            />
          ) : (
            <KPITracker
              byQuarter={data.byQuarter}
              registry={data.registry}
              segmentDescriptions={data.segmentDescriptions}
            />
          )}

          {/* Pipeline warnings and data quality notes are retained in checks.json
              and the /api/intel/[symbol] response but not surfaced in the UI. */}
        </>
      )}
    </div>
  );
}
