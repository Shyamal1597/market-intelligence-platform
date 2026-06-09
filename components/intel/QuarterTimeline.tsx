"use client";

import { quarterDisplay } from "@/lib/intel/uiHelpers";

export interface QuarterMeta {
  quarter: string;
  onTrackPct: number | null;   // null = no summary yet
  hasSummary: boolean;
}

interface Props {
  quarters: QuarterMeta[];
  selectedQuarter: string;
  onSelect: (q: string) => void;
}

function dotColor(pct: number | null): string {
  if (pct === null) return "bg-border";
  if (pct >= 70) return "bg-teal";
  if (pct >= 40) return "bg-amber";
  return "bg-danger";
}

function pctColor(pct: number | null): string {
  if (pct === null) return "text-muted";
  if (pct >= 70) return "text-teal";
  if (pct >= 40) return "text-amber";
  return "text-danger";
}

export function QuarterTimeline({ quarters, selectedQuarter, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {quarters.map((q) => {
        const isSelected = q.quarter === selectedQuarter;
        return (
          <button
            key={q.quarter}
            onClick={() => onSelect(q.quarter)}
            className={`flex flex-col items-center gap-1.5 px-4 py-2.5 rounded border shrink-0 transition-colors ${
              isSelected
                ? "border-amber/40 bg-amber/8 text-primary"
                : "border-border bg-surface text-muted hover:text-primary hover:border-border/60"
            }`}
          >
            <span className="text-xs font-mono font-bold">{quarterDisplay(q.quarter)}</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor(q.onTrackPct)}`} />
              <span className={`text-[10px] font-mono ${isSelected ? pctColor(q.onTrackPct) : "text-muted"}`}>
                {q.onTrackPct !== null ? `${q.onTrackPct}%` : "--"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
