"use client";

import { useMemo } from "react";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";

interface Props {
  symbol: string;
  /** Human-readable sector label, e.g. "Insurance -- Holding" */
  sectorLabel: string;
  byQuarter: Record<string, EnrichedClaim[]>;
}

export function CompanySummaryBar({ symbol, sectorLabel, byQuarter }: Props) {
  const { totalClaims, onTrackPct, dateRange } = useMemo(() => {
    const allClaims = Object.values(byQuarter).flat();
    const total = allClaims.length;

    let met = 0, moving = 0, decisive = 0;
    for (const c of allClaims) {
      const v = c.check?.verdict;
      if (v === "met")     { met++;     decisive++; }
      else if (v === "moving") { moving++; decisive++; }
      else if (v === "miss")   { decisive++; }
    }
    const pct = decisive > 0 ? Math.round(((met + moving) / decisive) * 100) : null;

    const quarters = sortQuarters(
      Object.keys(byQuarter).filter((q) => (byQuarter[q] ?? []).length > 0)
    );
    const range =
      quarters.length >= 2
        ? `${quarterDisplay(quarters[0])} → ${quarterDisplay(quarters[quarters.length - 1])}`
        : quarters.length === 1
        ? quarterDisplay(quarters[0])
        : null;

    return { totalClaims: total, onTrackPct: pct, dateRange: range };
  }, [byQuarter]);

  const pctColor =
    onTrackPct === null ? "" :
    onTrackPct >= 70    ? "text-teal" :
    onTrackPct >= 40    ? "text-amber" : "text-danger";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-mono py-2 border-b border-border/30">
      <span className="font-bold text-amber text-sm">{symbol}</span>
      <span className="text-muted/40">·</span>
      <span className="text-muted">{sectorLabel}</span>
      {totalClaims > 0 && (
        <>
          <span className="text-muted/40">·</span>
          <span className="text-muted">
            {totalClaims} claim{totalClaims !== 1 ? "s" : ""}
          </span>
        </>
      )}
      {onTrackPct !== null && (
        <>
          <span className="text-muted/40">·</span>
          <span className={`font-bold ${pctColor}`}>{onTrackPct}% on track</span>
        </>
      )}
      {dateRange && (
        <>
          <span className="text-muted/40">·</span>
          <span className="text-muted/60">{dateRange}</span>
        </>
      )}
    </div>
  );
}
