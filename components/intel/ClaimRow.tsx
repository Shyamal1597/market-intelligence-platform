"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Verdict } from "@/lib/intel/types";

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
    verdict: Verdict;
    verifiedInQuarter: string;
    /** What management said about the actual outcome in the target transcript. */
    actualText: string | null;
    /** Verbatim quote from the target transcript. */
    quote: string | null;
    reasoning: string;
  } | null;
}

interface Props {
  claim: EnrichedClaim;
  sourceQuarter: string;
}

/** Left accent bar colour by verdict (bg-* class) */
const VERDICT_ACCENT: Record<Verdict, string> = {
  met:       "bg-teal",
  moving:    "bg-amber",
  miss:      "bg-danger",
  pending:   "bg-border",
  ambiguous: "bg-border",
};

function claimValueDisplay(c: EnrichedClaim): string {
  if (c.direction === "value" && c.value !== null) return `${c.value}${c.metricUnit}`;
  if (c.direction === "range" && c.rangeMin !== null && c.rangeMax !== null) {
    return `${c.rangeMin}–${c.rangeMax}${c.metricUnit}`;
  }
  if (c.direction === "up")     return "↑ improve";
  if (c.direction === "down")   return "↓ decline";
  if (c.direction === "stable") return "→ stable";
  return c.qualitativeText ?? "—";
}

export function ClaimRow({ claim, sourceQuarter }: Props) {
  const [open, setOpen] = useState(false);
  const verdict: Verdict = claim.check?.verdict ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");
  // actualText or fall back to verbatim quote (LLM often fills quote but skips actualText)
  const displayActual = claim.check?.actualText ?? claim.check?.quote ?? null;

  return (
    <div className="relative">
      {/* Verdict accent bar — absolute left strip */}
      <div className={`absolute inset-y-0 left-0 w-0.5 ${VERDICT_ACCENT[verdict]}`} />

      {/* ── Summary row — always visible ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-start gap-4 pl-5 pr-4 py-3 hover:bg-surface/50 text-left transition-colors group"
      >
        {/* Col 1 — verdict badge + metric label + target quarter */}
        <div className="shrink-0 w-36 flex flex-col gap-1.5">
          <StatusBadge status={verdict} />
          <span className="text-[11px] font-mono text-amber leading-tight truncate">
            {claim.metricLabel}
          </span>
          <span className="text-[10px] font-mono text-muted">
            {claim.resolvedTargetQuarter ?? "—"}
          </span>
        </div>

        {/* Col 2 — guided value */}
        <div className="shrink-0 w-28 flex flex-col gap-0.5 pt-0.5">
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Guided
          </span>
          <span className="text-sm font-mono text-primary font-semibold leading-tight">
            {claimValueDisplay(claim)}
          </span>
        </div>

        {/* Col 3 — actual outcome (key info — always visible) */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
          {displayActual ? (
            <>
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                Actual
              </span>
              <span className="text-xs font-sans text-primary leading-relaxed line-clamp-2">
                {displayActual}
              </span>
            </>
          ) : (
            <span className="text-xs font-mono text-muted italic self-center mt-2">
              {verdict === "pending"
                ? "Awaiting next quarter's results"
                : "Not discussed in transcript"}
            </span>
          )}
        </div>

        {/* Col 4 — expand chevron */}
        <span className="shrink-0 mt-1.5 text-muted group-hover:text-primary transition-colors">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="pl-5 pr-4 pb-4 pt-2 space-y-3 border-t border-border/40 bg-base/20">
          {/* Metadata strip */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-muted">
            <span>
              Target: <span className="text-primary">{claim.targetText}</span>
              {claim.resolvedTargetQuarter && (
                <span className="text-muted"> → {claim.resolvedTargetQuarter}</span>
              )}
            </span>
            <span>
              Confidence: <span className="text-primary">{claim.confidence}</span>
            </span>
            {claim.conditional && (
              <span>
                Condition: <span className="text-amber">{claim.conditional}</span>
              </span>
            )}
          </div>

          {/* Original management quote */}
          <blockquote className="border-l-2 border-amber/30 pl-3 text-xs text-muted font-sans italic leading-relaxed">
            &ldquo;{claim.quote}&rdquo;
            {claim.speaker && (
              <span className="not-italic text-primary ml-2">— {claim.speaker}</span>
            )}
          </blockquote>

          {/* Verification result block */}
          {claim.check && (
            <div className="rounded border border-border bg-base p-3 space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                  Verified in{" "}
                  <span className="text-primary">{claim.check.verifiedInQuarter}</span>
                </span>
                <StatusBadge status={verdict} size="md" />
              </div>

              {/* Verbatim transcript quote */}
              {claim.check.quote && (
                <blockquote className="border-l-2 border-teal/30 pl-3 text-xs text-primary/80 font-sans italic leading-relaxed">
                  &ldquo;{claim.check.quote}&rdquo;
                </blockquote>
              )}

              {/* LLM reasoning */}
              {claim.check.reasoning && (
                <p className="text-[11px] text-muted font-sans leading-relaxed border-t border-border/60 pt-2">
                  {claim.check.reasoning}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
