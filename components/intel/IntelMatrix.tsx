"use client";

import React, { useState, useMemo } from "react";
import { quarterDisplay, sortQuarters } from "@/lib/intel/uiHelpers";
import { SegmentCard } from "./SegmentCard";
import type { QuarterSummary } from "@/lib/intel/types";
import type { EnrichedClaim } from "./ClaimRow";

interface Props {
  /** Quarters sorted newest-first (left → right columns). */
  quarters: string[];
  summaries: Record<string, QuarterSummary | null>;
  segments: string[];
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  /** Maps short segment key (e.g. "BAGIC") to full human-readable name. */
  segmentDescriptions?: Record<string, string>;
}

/** Split LLM prose into bullet sentences for display. */
function proseToBullets(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function VerdictChips({ counts }: { counts: QuarterSummary["verdictCounts"] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mt-1.5">
      {counts.met    > 0 && <span className="text-xs font-mono text-teal">{counts.met} met</span>}
      {counts.moving > 0 && <span className="text-xs font-mono text-amber">{counts.moving} moving</span>}
      {counts.miss   > 0 && <span className="text-xs font-mono text-danger">{counts.miss} miss</span>}
    </div>
  );
}

export function IntelMatrix({ quarters, summaries, segments, byQuarter, registry, segmentDescriptions }: Props) {
  const [expandedCell, setExpandedCell] = useState<{ seg: string; quarter: string } | null>(null);

  // All quarters with claims, newest-first — used to find "previous quarter" for each column
  const allSortedDesc = useMemo(
    () => [...sortQuarters(Object.keys(byQuarter))].reverse(),
    [byQuarter]
  );

  const getSegClaims = (q: string, seg: string) =>
    (byQuarter[q] ?? []).filter(
      (c) => registry.find((r) => r.key === c.metricKey)?.segment === seg
    );

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="border-collapse"
          style={{ minWidth: `${220 + quarters.length * 320}px`, width: "100%" }}
        >
          {/* ── Column headers ── */}
          <thead>
            <tr className="border-b border-border bg-surface">
              {/* Sticky corner */}
              <th className="sticky left-0 z-20 bg-surface border-r border-border w-52 min-w-52 px-5 py-4 text-left">
                <span className="text-xs font-mono text-muted uppercase tracking-wider">Segments</span>
              </th>

              {quarters.map((q) => {
                const s = summaries[q];

                // Next quarter in history = the one whose transcript verified this quarter's claims
                const qIdx = allSortedDesc.indexOf(q);
                const verifiedByQ = qIdx > 0 ? allSortedDesc[qIdx - 1] : null;
                const hasDecisive = (byQuarter[q] ?? []).some(c => {
                  const v = c.check?.verdict;
                  return v === "met" || v === "moving" || v === "miss";
                });

                return (
                  <th
                    key={q}
                    className="px-5 py-4 text-left border-r border-border/60 last:border-r-0 align-top bg-surface"
                    style={{ width: 320, minWidth: 260 }}
                  >
                    <span className="text-sm font-mono font-bold text-amber block tracking-wide">
                      {quarterDisplay(q)}
                    </span>

                    {/* Own-claims summary */}
                    {s ? (
                      <>
                        <span className={`text-xs font-mono font-semibold mt-0.5 block ${
                          s.onTrackPct >= 70 ? "text-teal" : s.onTrackPct >= 40 ? "text-amber" : "text-danger"
                        }`}>{s.onTrackPct}% on track</span>
                        <VerdictChips counts={s.verdictCounts} />
                      </>
                    ) : (() => {
                      const n = (byQuarter[q] ?? []).length;
                      return n > 0 ? (
                        <span className="text-[10px] font-mono text-amber/50 mt-1 block">
                          {n} claim{n !== 1 ? "s" : ""} · pending verification
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-muted/40 mt-1 block">—</span>
                      );
                    })()}

                    {/* Single-line attribution: which transcript verified this quarter's claims */}
                    {hasDecisive && verifiedByQ && (
                      <span className="text-[10px] font-mono text-muted/40 mt-1.5 block">
                        verified via {quarterDisplay(verifiedByQ)} transcript
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Rows ── */}
          <tbody>
            {segments.map((seg) => {
              const isSegExpanded = expandedCell?.seg === seg;

              return (
                <React.Fragment key={seg}>
                  {/* Data row */}
                  <tr className="border-b border-border/50">
                    {/* Segment label — sticky */}
                    <td className="sticky left-0 z-10 bg-surface border-r border-border px-5 py-5 align-top">
                      <span className="text-sm font-sans font-bold text-primary block leading-snug">
                        {segmentDescriptions?.[seg] ?? seg}
                      </span>
                      {segmentDescriptions?.[seg] && (
                        <span className="text-[10px] font-mono text-muted mt-0.5 block uppercase tracking-wider">
                          {seg}
                        </span>
                      )}
                    </td>

                    {/* Per-quarter cells */}
                    {quarters.map((q) => {
                      const note = summaries[q]?.segments[seg];
                      const claims = getSegClaims(q, seg);
                      const isCellActive = expandedCell?.seg === seg && expandedCell?.quarter === q;

                      return (
                        <td
                          key={q}
                          onClick={() =>
                            setExpandedCell(isCellActive ? null : { seg, quarter: q })
                          }
                          className={`px-5 py-5 border-r border-border/40 last:border-r-0 align-top cursor-pointer transition-colors ${
                            isCellActive ? "bg-amber/[0.06]" : "hover:bg-surface/60"
                          }`}
                        >
                          {note ? (
                            <div className="space-y-2.5">
                              {proseToBullets(note).map((bullet, i) => (
                                <div key={i} className="flex gap-2.5">
                                  <span className="text-amber shrink-0 leading-relaxed text-sm mt-px">
                                    •
                                  </span>
                                  <span className="text-sm font-sans text-primary/90 leading-relaxed">
                                    {bullet}
                                  </span>
                                </div>
                              ))}
                              {claims.length > 0 && (
                                <div className="flex items-center gap-2 pt-2.5 mt-1.5 border-t border-border/30">
                                  <span className="text-xs font-mono text-muted">
                                    {claims.length} claim{claims.length !== 1 ? "s" : ""}
                                  </span>
                                  <span className="text-amber/60 text-[10px]">
                                    {isCellActive ? "▲" : "▸"}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : claims.length > 0 ? (
                            /* No LLM summary yet — render raw Stage 3 claims directly */
                            <div className="space-y-2.5">
                              {claims.slice(0, 3).map((c) => {
                                const metric = registry.find((r) => r.key === c.metricKey);
                                const v = c.check?.verdict;
                                const isDecisive = v && v !== "pending" && v !== "ambiguous";
                                return (
                                  <div key={c.id} className="pl-2.5 border-l-2 border-border/40">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className="text-[10px] font-mono text-amber/70 truncate">
                                        {metric?.label ?? c.metricKey}
                                      </span>
                                      {isDecisive && (
                                        <span className={`text-[9px] font-mono uppercase tracking-wider shrink-0 ${
                                          v === "met" ? "text-teal" : v === "moving" ? "text-amber" : "text-danger"
                                        }`}>{v}</span>
                                      )}
                                    </div>
                                    <p className="text-xs font-sans text-primary/65 leading-relaxed line-clamp-2">
                                      &ldquo;{c.quote}&rdquo;
                                    </p>
                                  </div>
                                );
                              })}
                              {claims.length > 3 && (
                                <span className="text-[10px] font-mono text-muted/40">
                                  +{claims.length - 3} more
                                  <span className="text-amber/40 ml-1">{isCellActive ? "▲" : "▸"}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted/30 text-xs font-mono">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Drill-down row — shown when a cell in this segment row is expanded */}
                  {isSegExpanded && expandedCell && (
                    <tr className="border-b border-amber/20 bg-base/40">
                      <td colSpan={quarters.length + 1} className="p-0">
                        <div className="px-4 py-4">
                          <SegmentCard
                            segment={seg}
                            note={summaries[expandedCell.quarter]?.segments[seg] ?? null}
                            claims={getSegClaims(expandedCell.quarter, seg)}
                            byQuarter={byQuarter}
                            sourceQuarter={expandedCell.quarter}
                            registry={registry}
                            defaultOpen
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
