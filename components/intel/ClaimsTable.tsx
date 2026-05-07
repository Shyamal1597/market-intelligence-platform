"use client";

import { useMemo } from "react";
import { ClaimRow } from "./ClaimRow";
import type { EnrichedClaim } from "./ClaimRow";
import type { IntelFilters } from "./FiltersBar";
import { sortQuarters } from "@/lib/intel/uiHelpers";

interface Props {
  byQuarter: Record<string, EnrichedClaim[]>;
  filters: IntelFilters;
  /** All registry metrics — needed for segment lookup */
  registry: Array<{ key: string; segment: string }>;
}

export function ClaimsTable({ byQuarter, filters, registry }: Props) {
  // Build metricKey → segment map for segment filter
  const metricSegment = useMemo(
    () => Object.fromEntries(registry.map((m) => [m.key, m.segment])),
    [registry],
  );

  const { filtered, total } = useMemo(() => {
    let total = 0;
    const filtered: Array<{ sourceQuarter: string; claim: EnrichedClaim }> = [];

    for (const [q, claims] of sortQuarters(Object.keys(byQuarter)).map((q) => [q, byQuarter[q]] as const)) {
      if (filters.quarter && filters.quarter !== q) continue;
      for (const claim of claims) {
        total++;
        const status = claim.check?.status ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");
        if (filters.status !== "all" && status !== filters.status) continue;
        if (filters.segment && metricSegment[claim.metricKey] !== filters.segment) continue;
        if (filters.metric && claim.metricKey !== filters.metric) continue;
        if (filters.search && !claim.quote.toLowerCase().includes(filters.search.toLowerCase())) continue;
        filtered.push({ sourceQuarter: q, claim });
      }
    }

    return { filtered, total };
  }, [byQuarter, filters]);

  if (filtered.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center text-muted font-mono text-sm">
        {total === 0 ? "No claims extracted yet — run intel:rebuild first." : "No claims match the current filters."}
      </div>
    );
  }

  // Group by source quarter
  const grouped = filtered.reduce<Record<string, EnrichedClaim[]>>((acc, { sourceQuarter, claim }) => {
    (acc[sourceQuarter] ??= []).push(claim);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {sortQuarters(Object.keys(grouped)).map((q) => [q, grouped[q]] as const).map(([q, claims]) => (
        <div key={q} className="rounded border border-border overflow-hidden">
          {/* Quarter header */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-border">
            <span className="font-mono text-xs font-bold text-amber">{q}</span>
            <span className="text-muted font-mono text-[10px]">({claims.length} claim{claims.length !== 1 ? "s" : ""})</span>
          </div>
          {/* Claims */}
          <div className="divide-y divide-border/50 bg-base">
            {claims.map((c) => (
              <ClaimRow key={c.id} claim={c} sourceQuarter={q} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
