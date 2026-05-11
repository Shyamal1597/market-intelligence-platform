"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ClaimDetail } from "./ClaimDetail";
import { FiltersBar, type IntelFilters } from "./FiltersBar";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  segment: string;
  note: string | null;
  claims: EnrichedClaim[];
  /** Full byQuarter data — used to compute longitudinal tracks per metric. */
  byQuarter: Record<string, EnrichedClaim[]>;
  sourceQuarter: string;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
}

function VerdictPills({ claims }: { claims: EnrichedClaim[] }) {
  const counts = claims.reduce((acc, c) => {
    const v: Verdict = c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
      {counts.met    > 0 && <span className="text-teal">{counts.met} met</span>}
      {counts.moving > 0 && <span className="text-amber">{counts.moving} moving</span>}
      {counts.miss   > 0 && <span className="text-danger">{counts.miss} miss</span>}
      {counts.pending   > 0 && <span className="text-muted">{counts.pending} pending</span>}
      {counts.ambiguous > 0 && <span className="text-muted">{counts.ambiguous} ambiguous</span>}
    </div>
  );
}

export function SegmentCard({ segment, note, claims, byQuarter, sourceQuarter, registry }: Props) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<IntelFilters>({
    quarter: null, status: "all", segment: null, metric: null, search: "",
  });

  // Build longitudinal track for each metric in this segment
  const longitudinalByMetric = useMemo(() => {
    const allQuarters = sortQuarters(Object.keys(byQuarter));
    const map: Record<string, Array<{ quarter: string; verdict: Verdict }>> = {};
    for (const claim of claims) {
      const track = allQuarters
        .map((q) => {
          const c = byQuarter[q]?.find((cl) => cl.metricKey === claim.metricKey);
          if (!c) return null;
          const v: Verdict = c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
          return { quarter: q, verdict: v };
        })
        .filter(Boolean) as Array<{ quarter: string; verdict: Verdict }>;
      map[claim.metricKey] = track;
    }
    return map;
  }, [claims, byQuarter]);

  // Apply filters
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const verdict: Verdict = c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
      if (filters.status !== "all" && verdict !== filters.status) return false;
      if (filters.metric && c.metricKey !== filters.metric) return false;
      if (filters.search && !c.quote.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [claims, filters]);

  const segmentMetrics = registry.filter((m) => m.segment === segment);

  return (
    <div className="rounded border border-border overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-start gap-4 px-4 py-3 bg-surface hover:bg-surface/70 text-left transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">{segment}</span>
            <VerdictPills claims={claims} />
          </div>
          {note && (
            <p className="text-xs font-sans text-muted leading-relaxed line-clamp-2">{note}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-muted">
            {claims.length} claim{claims.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </div>
      </button>

      {/* Drill-down */}
      {open && (
        <div className="border-t border-border/60">
          {/* Filters — scoped to this segment */}
          <div className="px-4 pt-3">
            <FiltersBar
              filters={filters}
              quarters={[]}
              metrics={segmentMetrics}
              onChange={setFilters}
            />
          </div>

          {/* Claim rows */}
          <div className="divide-y divide-border/40">
            {filteredClaims.length === 0 ? (
              <p className="px-4 py-3 text-xs font-mono text-muted italic">No claims match filters.</p>
            ) : (
              filteredClaims.map((c) => (
                <ClaimDetail
                  key={c.id}
                  claim={c}
                  sourceQuarter={sourceQuarter}
                  longitudinalTrack={longitudinalByMetric[c.metricKey] ?? []}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
