"use client";

import type { QuarterSummary } from "@/lib/intel/types";

interface Props {
  summary: QuarterSummary | null;
  pending: boolean;     // true = summary not generated yet
  loading: boolean;
  sourceQuarter: string;
  symbol: string;
}

export function QuarterHeadline({ summary, pending, loading, sourceQuarter, symbol }: Props) {
  if (loading) {
    return (
      <div className="rounded border border-border bg-surface p-5 animate-pulse">
        <div className="h-4 bg-border/40 rounded w-3/4 mb-2" />
        <div className="h-4 bg-border/40 rounded w-1/2" />
      </div>
    );
  }

  if (pending || !summary) {
    return (
      <div className="rounded border border-border bg-surface p-5 flex items-center justify-between">
        <p className="text-muted font-mono text-xs">
          No summary generated for {sourceQuarter} -- run{" "}
          <code className="text-amber">npm run intel:summaries {symbol}</code>
        </p>
      </div>
    );
  }

  const { met, moving, miss } = summary.verdictCounts;
  const decisive = met + moving + miss;

  return (
    <div className="rounded border border-border bg-surface p-5 space-y-4">
      {/* Headline + verdict bar */}
      <div className="flex items-start gap-6">
        <p className="flex-1 text-primary font-sans text-sm leading-relaxed">
          {summary.headline}
        </p>

        {/* Verdict bar + on-track % */}
        {decisive > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className={`text-lg font-mono font-semibold ${
              summary.onTrackPct >= 70 ? "text-teal" :
              summary.onTrackPct >= 40 ? "text-amber" : "text-danger"
            }`}>
              {summary.onTrackPct}%
            </span>
            <span className="text-[10px] font-mono text-muted">on track</span>
            <div className="w-24 h-1.5 bg-base rounded-full overflow-hidden flex">
              <div className="h-full bg-teal" style={{ width: `${(met / decisive) * 100}%` }} />
              <div className="h-full bg-amber" style={{ width: `${(moving / decisive) * 100}%` }} />
              <div className="h-full bg-danger" style={{ width: `${(miss / decisive) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Key themes */}
      {summary.keyThemes.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
          {summary.keyThemes.map((theme, i) => (
            <span
              key={i}
              className="text-[10px] font-mono text-muted border border-border/60 rounded px-2 py-0.5"
            >
              {theme}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
