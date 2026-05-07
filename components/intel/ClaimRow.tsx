"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export interface EnrichedClaim {
  id: string;
  metricKey: string;
  metricLabel: string;
  metricUnit: string;
  quote: string;
  speaker: string | null;
  direction: string;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetText: string;
  targetQuarter: string | null;
  resolvedTargetQuarter: string | null;
  confidence: string;
  conditional: string | null;
  check: {
    status: string;
    actualValue: number | null;
    actualUnit: string;
    deltaText: string;
    reasoning: string;
    conditionalApplied: boolean;
    conditionalNote: string | null;
  } | null;
}

interface Props {
  claim: EnrichedClaim;
  sourceQuarter: string;
}

function claimValueDisplay(c: EnrichedClaim): string {
  if (c.direction === "value" && c.value !== null) return `${c.value}${c.metricUnit}`;
  if (c.direction === "range" && c.rangeMin !== null && c.rangeMax !== null) {
    return `${c.rangeMin}–${c.rangeMax}${c.metricUnit}`;
  }
  if (c.direction === "up")     return "▲ improve";
  if (c.direction === "down")   return "▼ decline";
  if (c.direction === "stable") return "▶ stable";
  return c.qualitativeText ?? "—";
}

export function ClaimRow({ claim, sourceQuarter }: Props) {
  const [open, setOpen] = useState(false);
  const status = claim.check?.status as import("@/lib/intel/types").CheckStatus | null ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");

  return (
    <div className="border-b border-border last:border-0">
      {/* Summary row */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-start gap-3 py-3 px-4 hover:bg-surface/60 text-left transition-colors group"
      >
        <span className="mt-0.5 text-muted group-hover:text-primary transition-colors shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Metric + quarter */}
        <div className="flex flex-col gap-0.5 w-32 shrink-0">
          <span className="text-xs font-mono text-amber truncate">{claim.metricLabel}</span>
          <span className="text-[10px] font-mono text-muted">{claim.resolvedTargetQuarter ?? "—"}</span>
        </div>

        {/* Claimed value */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono text-primary">{claimValueDisplay(claim)}</span>
          {claim.check?.deltaText && (
            <span className="ml-3 text-[10px] font-mono text-muted">{claim.check.deltaText}</span>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-10 pb-4 space-y-3">
          {/* Quote */}
          <blockquote className="border-l-2 border-amber/40 pl-3 text-xs text-muted font-sans italic leading-relaxed">
            "{claim.quote}"
            {claim.speaker && <span className="not-italic text-primary ml-2">— {claim.speaker}</span>}
          </blockquote>

          {/* Target + conditional */}
          <div className="flex flex-wrap gap-4 text-[11px] font-mono">
            <span className="text-muted">
              Target: <span className="text-primary">{claim.targetText}</span>
              {claim.resolvedTargetQuarter && (
                <span className="text-muted ml-1">→ {claim.resolvedTargetQuarter}</span>
              )}
            </span>
            <span className="text-muted">
              Confidence: <span className="text-primary">{claim.confidence}</span>
            </span>
            {claim.conditional && (
              <span className="text-muted">
                Condition: <span className="text-amber">{claim.conditional}</span>
              </span>
            )}
          </div>

          {/* Check result */}
          {claim.check && (
            <div className="bg-base rounded border border-border p-3 space-y-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={status} size="md" />
                {claim.check.actualValue !== null && (
                  <span className="text-xs font-mono text-muted">
                    Actual: <span className="text-primary">{claim.check.actualValue}{claim.check.actualUnit}</span>
                  </span>
                )}
              </div>
              {claim.check.reasoning && (
                <p className="text-xs text-muted font-sans leading-relaxed">{claim.check.reasoning}</p>
              )}
              {claim.check.conditionalApplied && claim.check.conditionalNote && (
                <p className="text-[11px] text-amber font-mono">Condition: {claim.check.conditionalNote}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
