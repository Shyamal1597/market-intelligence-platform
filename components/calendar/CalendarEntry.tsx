"use client";

export type { EarningsEntry } from "@/lib/bse-calendar";
import type { EarningsEntry } from "@/lib/bse-calendar";

const BADGE_STYLES: Record<EarningsEntry["category"], string> = {
  Results:  "bg-teal/10 text-teal border border-teal/30",
  Dividend: "bg-amber/10 text-amber border border-amber/30",
  Bonus:    "bg-purple-500/10 text-purple-400 border border-purple-500/30",
  Other:    "bg-surface text-muted border border-[#1E2235]",
};

export function CalendarEntry({ entry }: { entry: EarningsEntry }) {
  const { company, bseCode, purpose, category } = entry;

  // Only show purpose text if it provides information beyond what the badge already says
  const categoryWords = category.toLowerCase();
  const purposeLower = purpose.toLowerCase();
  const purposeAddsInfo = !purposeLower.includes(categoryWords);

  return (
    <div className="border border-[#1E2235] rounded-xl px-5 py-3.5 bg-surface hover:bg-white/[0.03] transition-all flex items-center gap-4">
      {/* Category badge */}
      <span
        className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded shrink-0 ${BADGE_STYLES[category]}`}
      >
        {category.toUpperCase()}
      </span>

      {/* Company name */}
      <span className="font-display text-lg font-semibold text-primary leading-tight min-w-0 flex-1">
        {company}
      </span>

      {/* BSE code */}
      <span className="font-mono text-xs text-muted border border-[#1E2235] px-1.5 py-0.5 rounded shrink-0">
        {bseCode}
      </span>

      {/* Purpose — only when it adds information beyond the badge */}
      {purposeAddsInfo && purpose && (
        <span className="text-xs text-muted truncate max-w-[280px] shrink-0">
          {purpose}
        </span>
      )}
    </div>
  );
}
