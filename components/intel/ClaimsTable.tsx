"use client";

import { useMemo } from "react";
import { ClaimRow } from "./ClaimRow";
import type { EnrichedClaim } from "./ClaimRow";
import type { IntelFilters } from "./FiltersBar";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  byQuarter: Record<string, EnrichedClaim[]>;
  filters: IntelFilters;
  /** All registry metrics -- needed for segment lookup */
  registry: Array<{ key: string; segment: string }>;
}

function QuarterSummaryBar({
  claims,
}: {
  claims: EnrichedClaim[];
}) {
  const counts = claims.reduce(
    (acc, c) => {
      const v: Verdict =
        c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const decisive = (counts.met ?? 0) + (counts.moving ?? 0) + (counts.miss ?? 0);

  return (
    <div className="flex items-center gap-3 text-[10px] font-mono">
      {(counts.met ?? 0) > 0 && (
        <span className="text-teal">{counts.met} met</span>
      )}
      {(counts.moving ?? 0) > 0 && (
        <span className="text-amber">{counts.moving} moving</span>
      )}
      {(counts.miss ?? 0) > 0 && (
        <span className="text-danger">{counts.miss} miss</span>
      )}
      {(counts.pending ?? 0) > 0 && (
        <span className="text-muted">{counts.pending} pending</span>
      )}
      {(counts.ambiguous ?? 0) > 0 && (
        <span className="text-muted">{counts.ambiguous} ambiguous</span>
      )}
      {/* On-track mini bar */}
      {decisive > 0 && (
        <div className="flex items-center gap-1.5 ml-1">
          <div className="w-24 h-1 bg-base rounded-full overflow-hidden flex">
            <div
              className="h-full bg-teal transition-all"
              style={{ width: `${((counts.met ?? 0) / decisive) * 100}%` }}
            />
            <div
              className="h-full bg-amber transition-all"
              style={{ width: `${((counts.moving ?? 0) / decisive) * 100}%` }}
            />
            <div
              className="h-full bg-danger transition-all"
              style={{ width: `${((counts.miss ?? 0) / decisive) * 100}%` }}
            />
          </div>
          <span className="text-muted">
            {Math.round(
              (((counts.met ?? 0) + (counts.moving ?? 0)) / decisive) * 100,
            )}
            % on track
          </span>
        </div>
      )}
    </div>
  );
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

    for (const [q, claims] of sortQuarters(Object.keys(byQuarter)).map(
      (q) => [q, byQuarter[q]] as const,
    )) {
      if (filters.quarter && filters.quarter !== q) continue;
      for (const claim of claims) {
        total++;
        const verdict =
          claim.check?.verdict ??
          (claim.resolvedTargetQuarter ? "pending" : "ambiguous");
        if (filters.status !== "all" && verdict !== filters.status) continue;
        if (
          filters.segment &&
          metricSegment[claim.metricKey] !== filters.segment
        )
          continue;
        if (filters.metric && claim.metricKey !== filters.metric) continue;
        if (
          filters.search &&
          !claim.quote.toLowerCase().includes(filters.search.toLowerCase())
        )
          continue;
        filtered.push({ sourceQuarter: q, claim });
      }
    }

    return { filtered, total };
  }, [byQuarter, filters, metricSegment]);

  if (filtered.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center text-muted font-mono text-sm">
        {total === 0
          ? "No claims extracted yet -- run intel:rebuild first."
          : "No claims match the current filters."}
      </div>
    );
  }

  // Group by source quarter
  const grouped = filtered.reduce<Record<string, EnrichedClaim[]>>(
    (acc, { sourceQuarter, claim }) => {
      (acc[sourceQuarter] ??= []).push(claim);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      {sortQuarters(Object.keys(grouped))
        .map((q) => [q, grouped[q]] as const)
        .map(([q, claims]) => (
          <div key={q} className="rounded border border-border overflow-hidden">
            {/* Quarter header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-primary">
                  {quarterDisplay(q)}
                </span>
                <span className="text-muted font-mono text-[10px]">
                  {claims.length} claim{claims.length !== 1 ? "s" : ""}
                </span>
              </div>
              <QuarterSummaryBar claims={claims} />
            </div>

            {/* Claim rows */}
            <div className="divide-y divide-border/40 bg-base">
              {claims.map((c) => (
                <ClaimRow key={c.id} claim={c} sourceQuarter={q} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
