"use client";

import type { QuoteData } from "@/lib/yahoo-finance";

interface SectorLeaderboardProps {
  quotes: QuoteData[];
}

export function SectorLeaderboard({ quotes }: SectorLeaderboardProps) {
  if (quotes.length === 0) return null;

  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-25px">
      {sorted.map((q, i) => (
        <span key={q.symbol} className="flex items-center gap-1">
          <span className="text-muted/50">{i + 1}.</span>
          <span className="text-primary">{q.label}</span>
          <span className={q.changePercent >= 0 ? "text-teal" : "text-danger"}>
            {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
          </span>
          {i < sorted.length - 1 && (
            <span className="text-muted/30 ml-2">·</span>
          )}
        </span>
      ))}
    </div>
  );
}
