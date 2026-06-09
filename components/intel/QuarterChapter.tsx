"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { quarterDisplay } from "@/lib/intel/uiHelpers";
import { GuidanceClaimCard } from "./GuidanceClaimCard";
import type { EnrichedClaim } from "./ClaimRow";
import type { VerdictFilter } from "./VerdictFilterBar";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  quarter: string;
  claims: EnrichedClaim[];
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions: Record<string, string>;
  defaultOpen?: boolean;
  verdictFilter: VerdictFilter;
}

export function QuarterChapter({
  quarter,
  claims,
  registry,
  segmentDescriptions,
  defaultOpen = false,
  verdictFilter,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // -- Stats ------------------------------------------------------------------
  const stats = useMemo(() => {
    let met = 0, moving = 0, miss = 0, pending = 0, decisive = 0;
    for (const c of claims) {
      const v = c.check?.verdict;
      if      (v === "met")     { met++;     decisive++; }
      else if (v === "moving")  { moving++;  decisive++; }
      else if (v === "miss")    { miss++;    decisive++; }
      else                       pending++;
    }
    return { met, moving, miss, pending, decisive };
  }, [claims]);

  const onTrackPct = stats.decisive > 0
    ? Math.round(((stats.met + stats.moving) / stats.decisive) * 100)
    : null;

  // -- Verification attribution -----------------------------------------------
  const verifiedByQ = useMemo(() => {
    for (const c of claims) {
      if (c.check?.verifiedInQuarter) return c.check.verifiedInQuarter;
    }
    return null;
  }, [claims]);

  // -- Filtered claims --------------------------------------------------------
  const visibleClaims = useMemo(() => {
    if (verdictFilter === "all") return claims;
    return claims.filter((c) => {
      const v: Verdict =
        c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
      return v === verdictFilter;
    });
  }, [claims, verdictFilter]);

  // -- Group by segment (preserve registry order) -----------------------------
  const segmentGroups = useMemo(() => {
    const groups = new Map<string, EnrichedClaim[]>();
    for (const c of visibleClaims) {
      const seg = registry.find((r) => r.key === c.metricKey)?.segment ?? "other";
      if (!groups.has(seg)) groups.set(seg, []);
      groups.get(seg)!.push(c);
    }
    return groups;
  }, [visibleClaims, registry]);

  const hasDecisive      = stats.decisive > 0;
  const hasVisibleClaims = visibleClaims.length > 0;

  // -- Verdict summary string -------------------------------------------------
  const verdictSummary = [
    stats.met     > 0 ? `${stats.met} met`       : "",
    stats.moving  > 0 ? `${stats.moving} moving`  : "",
    stats.miss    > 0 ? `${stats.miss} miss`       : "",
  ].filter(Boolean).join(" · ");

  const pctColor =
    onTrackPct === null ? "" :
    onTrackPct >= 70    ? "text-teal" :
    onTrackPct >= 40    ? "text-amber" : "text-danger";

  return (
    <div className="rounded border border-border overflow-hidden">

      {/* -- Chapter header -- */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-surface hover:bg-surface/80 transition-colors text-left"
      >
        {/* Chevron */}
        <span className="text-muted/50 shrink-0">
          {open && hasVisibleClaims
            ? <ChevronDown size={13} />
            : <ChevronRight size={13} />}
        </span>

        {/* Quarter label */}
        <span className="text-sm font-mono font-bold text-amber shrink-0">
          {quarterDisplay(quarter)}
        </span>

        {/* On-track % or pending badge */}
        {hasDecisive ? (
          <span className={`text-xs font-mono font-semibold shrink-0 ${pctColor}`}>
            {onTrackPct}% on track
          </span>
        ) : (
          <span className="text-[11px] font-mono text-amber/50 shrink-0">
            ● pending verification
          </span>
        )}

        {/* Claim count + verdict breakdown */}
        <span className="text-[11px] font-mono text-muted/50">
          {claims.length} claim{claims.length !== 1 ? "s" : ""}
          {verdictSummary && ` · ${verdictSummary}`}
        </span>

        {/* Verification attribution -- right-aligned */}
        {hasDecisive && verifiedByQ && (
          <span className="ml-auto text-[10px] font-mono text-muted/35 shrink-0">
            verified via {quarterDisplay(verifiedByQ)} transcript
          </span>
        )}
      </button>

      {/* -- Chapter body -- */}
      {open && hasVisibleClaims && (
        <div className="divide-y divide-border/20 bg-base/30">
          {[...segmentGroups.entries()].map(([seg, segClaims]) => (
            <div key={seg}>
              {/* Segment divider */}
              <div className="px-5 py-2 bg-surface/40 flex items-center gap-2">
                <span className="text-xs font-sans font-semibold text-primary/70">
                  {segmentDescriptions[seg] ?? seg}
                </span>
                {segmentDescriptions[seg] && (
                  <span className="text-[10px] font-mono text-muted/50 uppercase tracking-wider">
                    {seg}
                  </span>
                )}
              </div>

              {/* Claim cards */}
              <div className="px-5 py-4 space-y-5">
                {segClaims.map((c) => (
                  <GuidanceClaimCard key={c.id} claim={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
