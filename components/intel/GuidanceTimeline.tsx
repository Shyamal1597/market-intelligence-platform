"use client";

import { useMemo, useState } from "react";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import { QuarterChapter } from "./QuarterChapter";
import { VerdictFilterBar, type VerdictFilter } from "./VerdictFilterBar";
import type { EnrichedClaim } from "./ClaimRow";

interface Props {
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions?: Record<string, string>;
}

export function GuidanceTimeline({
  byQuarter,
  registry,
  segmentDescriptions = {},
}: Props) {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

  // All quarters with claims, newest first
  const quarters = useMemo(
    () =>
      [...sortQuarters(
        Object.keys(byQuarter).filter((q) => (byQuarter[q] ?? []).length > 0)
      )].reverse(),
    [byQuarter]
  );

  if (quarters.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm">
        No claims data yet — run the pipeline to extract guidance.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Verdict filter */}
      <VerdictFilterBar active={verdictFilter} onChange={setVerdictFilter} />

      {/* Quarter chapters — newest first */}
      <div className="space-y-2">
        {quarters.map((q, i) => (
          <QuarterChapter
            key={q}
            quarter={q}
            claims={byQuarter[q] ?? []}
            registry={registry}
            segmentDescriptions={segmentDescriptions}
            defaultOpen={i === 0}
            verdictFilter={verdictFilter}
          />
        ))}
      </div>
    </div>
  );
}
