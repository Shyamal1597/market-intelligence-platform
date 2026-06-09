"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { quarterDisplay } from "@/lib/intel/uiHelpers";
import type { Verdict } from "@/lib/intel/types";
import type { EnrichedClaim } from "./ClaimRow";

interface LongitudinalPoint {
  quarter: string;
  verdict: Verdict;
}

interface Props {
  claim: EnrichedClaim;
  sourceQuarter: string;
  /** Pre-computed from byQuarter for this metricKey across all source quarters. */
  longitudinalTrack: LongitudinalPoint[];
}

const VERDICT_ACCENT: Record<Verdict, string> = {
  met:       "bg-teal",
  moving:    "bg-amber",
  miss:      "bg-danger",
  pending:   "bg-border",
  ambiguous: "bg-border",
};

function claimValueDisplay(c: EnrichedClaim): string {
  if (c.direction === "value" && c.value !== null) return `${c.value}${c.metricUnit}`;
  if (c.direction === "range" && c.rangeMin !== null && c.rangeMax !== null)
    return `${c.rangeMin}-${c.rangeMax}${c.metricUnit}`;
  if (c.direction === "up")     return "↑ improve";
  if (c.direction === "down")   return "↓ decline";
  if (c.direction === "stable") return "→ stable";
  return c.qualitativeText ?? "--";
}

export function ClaimDetail({ claim, sourceQuarter, longitudinalTrack }: Props) {
  const [open, setOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const verdict: Verdict =
    claim.check?.verdict ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");
  const displayActual = claim.check?.actualText ?? claim.check?.quote ?? null;

  return (
    <div className="relative">
      {/* Verdict accent bar */}
      <div className={`absolute inset-y-0 left-0 w-0.5 ${VERDICT_ACCENT[verdict]}`} />

      {/* Summary row */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-start gap-4 pl-5 pr-4 py-3 hover:bg-surface/50 text-left transition-colors group"
      >
        <div className="shrink-0 w-36 flex flex-col gap-1.5">
          <StatusBadge status={verdict} />
          <span className="text-[11px] font-mono text-amber leading-tight truncate">{claim.metricLabel}</span>
          <span className="text-[10px] font-mono text-muted">{claim.resolvedTargetQuarter ?? "--"}</span>
        </div>

        <div className="shrink-0 w-28 flex flex-col gap-0.5 pt-0.5">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Guided</span>
          <span className="text-sm font-mono text-primary font-semibold leading-tight">{claimValueDisplay(claim)}</span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
          {displayActual ? (
            <>
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Actual</span>
              <span className="text-xs font-sans text-primary leading-relaxed line-clamp-2">{displayActual}</span>
            </>
          ) : (
            <span className="text-xs font-mono text-muted italic self-center mt-2">
              {verdict === "pending"
                ? claim.check?.verifiedInQuarter === "unknown" || !claim.resolvedTargetQuarter
                  ? "Forward guidance -- no target quarter yet"
                  : "Awaiting next quarter's results"
                : "Not discussed in transcript"}
            </span>
          )}
        </div>

        <span className="shrink-0 mt-1.5 text-muted group-hover:text-primary transition-colors">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {/* Expanded audit trail */}
      {open && (
        <div className="pl-5 pr-4 pb-5 pt-3 space-y-4 border-t border-border/40 bg-base/20">

          {/* Metadata strip */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-muted">
            <span>Target: <span className="text-primary">{claim.targetText}</span>
              {claim.resolvedTargetQuarter && <span> → {claim.resolvedTargetQuarter}</span>}
            </span>
            <span>Confidence: <span className="text-primary">{claim.confidence}</span></span>
            {claim.conditional && <span>Condition: <span className="text-amber">{claim.conditional}</span></span>}
          </div>

          {/* Two-column before/after */}
          <div className="grid grid-cols-2 gap-3">
            {/* LEFT -- Source quarter promise */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-amber/70 uppercase tracking-wider">{sourceQuarter}</span>
                <span className="text-[10px] font-mono text-muted">Management statement</span>
              </div>
              <blockquote className="border-l-2 border-amber/30 pl-3 text-xs text-muted font-sans italic leading-relaxed flex-1">
                &ldquo;{claim.quote}&rdquo;
                {claim.speaker && (
                  <span className="block not-italic text-primary/70 text-[10px] mt-1">-- {claim.speaker}</span>
                )}
              </blockquote>
            </div>

            {/* RIGHT -- Target quarter actuals */}
            {claim.check ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {claim.check.verifiedInQuarter && claim.check.verifiedInQuarter !== "unknown" ? (
                      <>
                        <span className="text-[10px] font-mono font-bold text-primary/70 uppercase tracking-wider">{claim.check.verifiedInQuarter}</span>
                        <span className="text-[10px] font-mono text-muted">Reported actuals</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono text-muted">Verification pending</span>
                    )}
                  </div>
                  <StatusBadge status={verdict} size="md" />
                </div>

                {claim.check.quote && claim.check.quote.trim() !== claim.quote.trim() ? (
                  <blockquote className="border-l-2 border-teal/30 pl-3 text-xs text-primary/80 font-sans italic leading-relaxed">
                    &ldquo;{claim.check.quote}&rdquo;
                    {(claim.check as { speaker?: string | null }).speaker && (
                      <span className="block not-italic text-primary/70 text-[10px] mt-1">
                        -- {(claim.check as { speaker?: string | null }).speaker}
                        {(claim.check as { section?: string | null }).section && (
                          <span className="text-muted"> · {(claim.check as { section?: string | null }).section}</span>
                        )}
                      </span>
                    )}
                  </blockquote>
                ) : (
                  <p className="text-xs font-mono text-muted italic">{displayActual ?? "--"}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <span className="text-xs font-mono text-muted italic">Not yet verified</span>
              </div>
            )}
          </div>

          {/* Transcript context -- collapsible */}
          {(claim.check as { context?: string | null } | null)?.context && (
            <div>
              <button
                onClick={() => setContextOpen((p) => !p)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-muted hover:text-primary transition-colors"
              >
                {contextOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                Transcript context
              </button>
              {contextOpen && (
                <p className="mt-2 text-[11px] font-sans text-muted leading-relaxed border-l-2 border-border/40 pl-3">
                  {(claim.check as { context?: string | null })!.context}
                </p>
              )}
            </div>
          )}

          {/* Reasoning */}
          {claim.check?.reasoning && (
            <p className="text-[11px] text-muted font-sans leading-relaxed border-t border-border/60 pt-2">
              {claim.check.reasoning}
            </p>
          )}

          {/* Longitudinal track */}
          {longitudinalTrack.length > 1 && (
            <div className="border-t border-border/40 pt-3">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-2">
                {claim.metricLabel} -- history
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {longitudinalTrack.map((pt, i) => (
                  <div key={pt.quarter} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted text-[10px]">→</span>}
                    <div className="flex flex-col items-center gap-0.5">
                      <StatusBadge status={pt.verdict} />
                      <span className="text-[9px] font-mono text-muted">{quarterDisplay(pt.quarter)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
