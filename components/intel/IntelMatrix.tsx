"use client";

import React, { useState } from "react";
import { quarterDisplay } from "@/lib/intel/uiHelpers";
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
    <div className="flex items-center gap-2 flex-wrap mt-1">
      {counts.met    > 0 && <span className="text-[10px] font-mono text-teal">{counts.met} met</span>}
      {counts.moving > 0 && <span className="text-[10px] font-mono text-amber">{counts.moving} moving</span>}
      {counts.miss   > 0 && <span className="text-[10px] font-mono text-danger">{counts.miss} miss</span>}
    </div>
  );
}

export function IntelMatrix({ quarters, summaries, segments, byQuarter, registry }: Props) {
  const [expandedCell, setExpandedCell] = useState<{ seg: string; quarter: string } | null>(null);

  const getSegClaims = (q: string, seg: string) =>
    (byQuarter[q] ?? []).filter(
      (c) => registry.find((r) => r.key === c.metricKey)?.segment === seg
    );

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="border-collapse"
          style={{ minWidth: `${180 + quarters.length * 260}px`, width: "100%" }}
        >
          {/* ── Column headers ── */}
          <thead>
            <tr className="border-b border-border bg-surface">
              {/* Sticky corner */}
              <th className="sticky left-0 z-20 bg-surface border-r border-border w-36 min-w-36 px-4 py-3 text-left">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Segments</span>
              </th>

              {quarters.map((q) => {
                const s = summaries[q];
                return (
                  <th
                    key={q}
                    className="px-4 py-3 text-left border-r border-border/60 last:border-r-0 align-top bg-surface"
                    style={{ width: 260, minWidth: 200 }}
                  >
                    <span className="text-xs font-mono font-bold text-amber block">
                      {quarterDisplay(q)}
                    </span>
                    {s ? (
                      <VerdictChips counts={s.verdictCounts} />
                    ) : (
                      <span className="text-[10px] font-mono text-muted/40 mt-1 block">—</span>
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
                    <td className="sticky left-0 z-10 bg-surface border-r border-border px-4 py-4 align-top">
                      <span className="text-xs font-mono font-bold text-primary uppercase tracking-wide">
                        {seg}
                      </span>
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
                          className={`px-4 py-4 border-r border-border/40 last:border-r-0 align-top cursor-pointer transition-colors ${
                            isCellActive ? "bg-amber/[0.06]" : "hover:bg-surface/60"
                          }`}
                        >
                          {note ? (
                            <div className="space-y-1.5">
                              {proseToBullets(note).map((bullet, i) => (
                                <div key={i} className="flex gap-2">
                                  <span className="text-amber shrink-0 leading-relaxed text-[11px]">
                                    •
                                  </span>
                                  <span className="text-[11px] font-sans text-primary/90 leading-relaxed">
                                    {bullet}
                                  </span>
                                </div>
                              ))}
                              {claims.length > 0 && (
                                <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border/30">
                                  <span className="text-[10px] font-mono text-muted">
                                    {claims.length} claim{claims.length !== 1 ? "s" : ""}
                                  </span>
                                  <span className="text-amber/50 text-[9px]">
                                    {isCellActive ? "▲" : "▸"}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted/30 text-[10px] font-mono">—</span>
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
