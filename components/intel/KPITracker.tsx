"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { sortQuarters, quarterDisplay, snippetQuote } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";
import type { Verdict } from "@/lib/intel/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOnTrack(v: Verdict | null | undefined): boolean {
  return v === "met" || v === "moving";
}

type Trend = "improving" | "consistent" | "declining" | "volatile" | null;

function computeTrend(verdicts: (Verdict | null | undefined)[]): Trend {
  const decisive = verdicts.filter(
    (v): v is Verdict => v === "met" || v === "moving" || v === "miss"
  );
  if (decisive.length < 2) return null;
  const recent = decisive.slice(-3);
  if (recent.every(isOnTrack)) return "consistent";
  if (!isOnTrack(recent[0]) && isOnTrack(recent[recent.length - 1])) return "improving";
  if (isOnTrack(recent[0]) && !isOnTrack(recent[recent.length - 1])) return "declining";
  return "volatile";
}

const VERDICT_COLORS: Record<string, string> = {
  met:       "text-teal",
  moving:    "text-amber",
  miss:      "text-danger",
  pending:   "text-muted/50",
  ambiguous: "text-muted/30",
};

const BORDER_COLORS: Record<string, string> = {
  met:       "border-l-teal/60",
  moving:    "border-l-amber/60",
  miss:      "border-l-danger/60",
  pending:   "border-l-border",
  ambiguous: "border-l-border/40",
};

// ── Verdict cell ──────────────────────────────────────────────────────────────

function QuarterCell({
  quarter,
  claim,
}: {
  quarter: string;
  claim: EnrichedClaim | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const v = claim?.check?.verdict ?? (claim ? "pending" : null);
  const borderClass = v ? BORDER_COLORS[v] ?? "border-l-border/30" : "border-l-border/20";
  const verdictClass = v ? VERDICT_COLORS[v] ?? "text-muted/30" : "text-muted/20";

  return (
    <div
      className={`border-l-2 ${borderClass} rounded-sm bg-surface/40 min-w-0 ${claim ? "cursor-pointer" : ""}`}
      onClick={() => claim && setExpanded((p) => !p)}
    >
      {/* ── Always-visible header ── */}
      <div className="pl-3 pr-2 py-2.5">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-[10px] font-mono text-muted/60 uppercase tracking-wide shrink-0">
            {quarterDisplay(quarter)}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {v && (
              <span className={`text-[9px] font-mono uppercase tracking-wider font-bold ${verdictClass}`}>
                {v}
              </span>
            )}
            {claim && (
              <span className="text-[9px] font-mono text-muted/30">
                {expanded ? "▲" : "▾"}
              </span>
            )}
          </div>
        </div>

        {claim?.targetText && (
          <p className="text-[11px] font-mono text-primary/70 leading-snug">
            ↗ {claim.targetText}
          </p>
        )}

        {/* Collapsed preview — single line of quote */}
        {!expanded && claim && (
          <p className="text-[11px] font-sans text-primary/50 italic leading-relaxed mt-1 line-clamp-2">
            &ldquo;{snippetQuote(claim.quote, 120)}&rdquo;
          </p>
        )}
      </div>

      {/* ── Expanded detail ── */}
      {expanded && claim && (
        <div
          className="border-t border-border/20 px-3 pb-3 pt-2.5 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Source quarter guidance quote */}
          <div>
            <span className="text-[9px] font-mono text-amber/60 uppercase tracking-wider block mb-1">
              {quarterDisplay(quarter)} — guidance
            </span>
            <blockquote className="text-[11px] font-sans text-primary/70 italic leading-relaxed">
              &ldquo;{claim.quote}&rdquo;
            </blockquote>
            {claim.speaker && (
              <span className="text-[9px] font-mono text-muted/40 mt-0.5 block">
                — {claim.speaker}
              </span>
            )}
          </div>

          {/* Verification transcript quote */}
          {claim.check ? (
            <div className="pt-2 border-t border-border/20">
              <span className="text-[9px] font-mono text-muted/50 uppercase tracking-wider block mb-1">
                {quarterDisplay(claim.check.verifiedInQuarter)} — confirmed
              </span>

              {/* Verbatim quote from verification transcript */}
              {claim.check.quote && (
                <blockquote className="text-[11px] font-sans text-primary/65 italic leading-relaxed mb-2">
                  &ldquo;{claim.check.quote}&rdquo;
                </blockquote>
              )}

              {/* Synthesised outcome (if different from verbatim) */}
              {claim.check.actualText && claim.check.actualText !== claim.check.quote && (
                <p className="text-[11px] font-sans text-primary/55 leading-relaxed">
                  {claim.check.actualText}
                </p>
              )}
            </div>
          ) : (
            <div className="pt-2 border-t border-border/20">
              <span className="text-[9px] font-mono text-muted/40">
                Awaiting{claim.resolvedTargetQuarter ? ` ${quarterDisplay(claim.resolvedTargetQuarter)}` : " next"} transcript
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Track record badge ────────────────────────────────────────────────────────

function TrackRecord({
  verdicts,
}: {
  verdicts: (Verdict | null | undefined)[];
}) {
  const decisive = verdicts.filter(
    (v): v is Verdict => v === "met" || v === "moving" || v === "miss"
  );
  if (decisive.length === 0) return null;
  const onTrackCount = decisive.filter(isOnTrack).length;
  const pct = Math.round((onTrackCount / decisive.length) * 100);
  const trend = computeTrend(verdicts);

  const pctColor =
    pct >= 70 ? "text-teal" : pct >= 40 ? "text-amber" : "text-danger";

  const TrendIcon =
    trend === "improving" ? TrendingUp :
    trend === "declining" ? TrendingDown : Minus;

  const trendColor =
    trend === "improving" ? "text-teal/70" :
    trend === "declining" ? "text-danger/70" : "text-muted/40";

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] font-mono text-muted/50">
        {onTrackCount}/{decisive.length}
      </span>
      <span className={`text-[10px] font-mono font-bold ${pctColor}`}>
        {pct}%
      </span>
      {trend && (
        <TrendIcon size={11} className={trendColor} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function KPITracker({ byQuarter, registry, segmentDescriptions }: Props) {
  // All quarters sorted oldest → newest (tells a story left to right)
  const chronologicalQuarters = useMemo(
    () => sortQuarters(Object.keys(byQuarter)).filter((q) => (byQuarter[q] ?? []).length > 0),
    [byQuarter]
  );

  // Group registry by segment, preserving registry order
  const segmentGroups = useMemo(() => {
    const groups = new Map<string, typeof registry>();
    for (const metric of registry) {
      if (!groups.has(metric.segment)) groups.set(metric.segment, []);
      groups.get(metric.segment)!.push(metric);
    }
    return groups;
  }, [registry]);

  if (chronologicalQuarters.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm">
        No claims data yet
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {[...segmentGroups.entries()].map(([segment, metrics]) => {
        // Skip segments that have no claims across any quarter
        const hasAnyClaim = metrics.some((m) =>
          chronologicalQuarters.some((q) =>
            (byQuarter[q] ?? []).some((c) => c.metricKey === m.key)
          )
        );
        if (!hasAnyClaim) return null;

        return (
          <div key={segment} className="rounded border border-border overflow-hidden">
            {/* Segment header */}
            <div className="px-5 py-3 bg-surface border-b border-border flex items-center gap-3">
              <span className="text-xs font-sans font-bold text-primary">
                {segmentDescriptions?.[segment] ?? segment}
              </span>
              <span className="text-[10px] font-mono text-muted/60 uppercase tracking-wider">
                {segment}
              </span>
            </div>

            {/* Metric rows */}
            <div className="divide-y divide-border/30">
              {metrics.map((metric) => {
                // Build per-quarter claim map for this metric
                const claimByQ: Record<string, EnrichedClaim | null> = {};
                for (const q of chronologicalQuarters) {
                  claimByQ[q] =
                    (byQuarter[q] ?? []).find((c) => c.metricKey === metric.key) ?? null;
                }

                const quartersWithData = chronologicalQuarters.filter(
                  (q) => claimByQ[q] !== null
                );
                if (quartersWithData.length === 0) return null;

                const allVerdicts = quartersWithData.map(
                  (q) => claimByQ[q]?.check?.verdict
                );

                return (
                  <div key={metric.key} className="px-5 py-4">
                    {/* Metric header */}
                    <div className="flex items-center justify-between mb-3 gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-sans font-semibold text-primary truncate">
                          {metric.label}
                        </span>
                        {metric.unit && metric.unit !== "qualitative" && (
                          <span className="text-[10px] font-mono text-muted/60 shrink-0">
                            {metric.unit}
                          </span>
                        )}
                      </div>
                      <TrackRecord verdicts={allVerdicts} />
                    </div>

                    {/* Quarter cells — scroll horizontally if many quarters */}
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${quartersWithData.length}, minmax(200px, 1fr))`,
                          minWidth: `${quartersWithData.length * 210}px`,
                        }}
                      >
                        {quartersWithData.map((q) => (
                          <QuarterCell key={q} quarter={q} claim={claimByQ[q]} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
