"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import type { BseSectorQuote } from "@/lib/bse-sectors";
import { EOD_SENSEX_SECTORS } from "@/lib/bse-sectors";

// ── Single tile ───────────────────────────────────────────────────────────────

function BseTile({ s }: { s: BseSectorQuote }) {
  const up  = s.changePercent >= 0;
  const sign = up ? "+" : "";

  let bgClass: string;
  let borderClass: string;
  if      (s.changePercent >  1.5) { bgClass = "bg-teal/10";   borderClass = "border-l-teal";   }
  else if (s.changePercent < -1.5) { bgClass = "bg-danger/10"; borderClass = "border-l-danger"; }
  else                             { bgClass = "";              borderClass = "border-l-border"; }

  return (
    <div
      className={`border border-border border-l-2 ${bgClass} ${borderClass} rounded-xl p-3 flex flex-col gap-1 hover:bg-white/[0.04] transition-colors`}
    >
      <p className="font-mono text-[10px] tracking-widest text-muted uppercase truncate">
        {s.label}
      </p>
      <p className="font-mono text-lg font-bold text-primary leading-none">
        {s.price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
      </p>
      <p className={`font-mono text-[11px] flex items-center gap-1 ${up ? "text-teal" : "text-danger"}`}>
        {up ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
        {sign}{Math.abs(s.change).toFixed(0)}
        <span className="ml-1 font-semibold">{sign}{Math.abs(s.changePercent).toFixed(2)}%</span>
      </p>
    </div>
  );
}

// ── EOD 6×4 grid (matches report template layout) ────────────────────────────

function EodGrid({ byCode }: { byCode: Map<string, BseSectorQuote> }) {
  const ROWS = 6;
  const COLS = 4;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {[0, 1, 2, 3].map((col) => (
              <>
                <th key={`lbl${col}`} className="py-1.5 px-2 text-left font-mono text-[10px] text-muted uppercase tracking-widest border-b border-border">
                  Index
                </th>
                <th key={`pct${col}`} className="py-1.5 px-2 text-right font-mono text-[10px] text-muted uppercase tracking-widest border-b border-border">
                  (%)
                </th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-border/50 hover:bg-white/[0.02]">
              {Array.from({ length: COLS }, (_, colIdx) => {
                const sectorDef = EOD_SENSEX_SECTORS[rowIdx * COLS + colIdx];
                const s = sectorDef ? byCode.get(sectorDef.code) : undefined;
                const up = s && s.changePercent >= 0;
                return (
                  <>
                    <td key={`l${colIdx}`} className="py-2 px-2 font-sans text-[11px] text-primary">
                      {sectorDef?.label ?? "—"}
                    </td>
                    <td
                      key={`p${colIdx}`}
                      className={`py-2 px-2 text-right font-mono text-[11px] font-semibold tabular-nums ${
                        !s ? "text-muted" : up ? "text-teal" : "text-danger"
                      }`}
                    >
                      {s
                        ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%`
                        : "—"}
                    </td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  sectors: BseSectorQuote[];
  loading?: boolean;
}

export function BseSectorGrid({ sectors, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-[88px] animate-pulse bg-surface rounded-xl border border-border" />
        ))}
      </div>
    );
  }

  if (sectors.length === 0) {
    return (
      <p className="text-muted text-sm font-mono">
        BSE sector data unavailable — market may be closed.
      </p>
    );
  }

  // Build lookup map
  const byCode = new Map(sectors.map((s) => [s.code, s]));

  // Split: EOD-mapped sectors (24) vs any extras
  const eodCodes = new Set(EOD_SENSEX_SECTORS.map((s) => s.code));
  const extraSectors = sectors.filter((s) => !eodCodes.has(s.code));

  const advancing = sectors.filter((s) => s.changePercent > 0).length;
  const declining = sectors.filter((s) => s.changePercent < 0).length;

  return (
    <div className="space-y-5">
      {/* Breadth bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex rounded-full overflow-hidden h-1.5">
          <div
            className="bg-teal transition-all"
            style={{ width: `${(advancing / (advancing + declining || 1)) * 100}%` }}
          />
          <div className="flex-1 bg-danger" />
        </div>
        <span className="text-[11px] font-mono text-teal">{advancing} UP</span>
        <span className="text-[11px] font-mono text-danger">{declining} DOWN</span>
      </div>

      {/* EOD template grid (6×4) — matches the report layout */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-1 border-b border-border/60">
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase">
            Report Layout — Sectorial Contribution in SENSEX
          </p>
        </div>
        <div className="px-4 py-3">
          <EodGrid byCode={byCode} />
        </div>
      </div>

      {/* Tile heatmap for quick visual scan */}
      <div>
        <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-3">
          All BSE Sectors
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {sectors
            .sort((a, b) => b.changePercent - a.changePercent)
            .map((s) => <BseTile key={s.code} s={s} />)}
        </div>
      </div>

      {/* Extra sectors (cat=3 only, not in EOD map) */}
      {extraSectors.length > 0 && (
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-3">
            Thematic Indices
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {extraSectors.map((s) => <BseTile key={s.code} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}
