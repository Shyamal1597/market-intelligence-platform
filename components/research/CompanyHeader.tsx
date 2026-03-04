"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";
import type { WatchlistEntry } from "@/lib/watchlist";

interface LivePrice {
  price: number;
  change: number;
  changePercent: number;
}

interface Props {
  entry: WatchlistEntry;
}

export function CompanyHeader({ entry }: Props) {
  const [live, setLive] = useState<LivePrice | null>(null);

  useEffect(() => {
    fetch(`/api/quote/${entry.symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LivePrice | null) => {
        if (data) setLive(data);
      })
      .catch(() => {});
  }, [entry.symbol]);

  const isUp = (live?.change ?? 0) >= 0;

  return (
    <div className="flex items-start justify-between border-b border-border pb-5 mb-5">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-4xl font-semibold text-primary tracking-tight">
            {entry.name}
          </h1>
          {entry.rating && (
            <span className="text-xs font-mono px-2 py-1 rounded border border-amber/30 text-amber shrink-0">
              {entry.rating}
              {entry.targetPrice != null && ` · TP ₹${entry.targetPrice}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-muted">
          <span className="text-amber">{entry.symbol}</span>
          {entry.bseCode && <span>BSE {entry.bseCode}</span>}
          {entry.sector && <span>{entry.sector}</span>}
          {entry.analyst && <span>Analyst: {entry.analyst}</span>}
        </div>
      </div>

      {live ? (
        <div className="text-right">
          <p className="font-mono text-2xl text-primary">
            ₹{live.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </p>
          <p
            className={clsx(
              "flex items-center justify-end gap-1 text-sm font-mono",
              isUp ? "text-teal" : "text-danger"
            )}
          >
            {isUp ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {isUp ? "+" : ""}
            {live.change.toFixed(2)} ({live.changePercent.toFixed(2)}%)
          </p>
        </div>
      ) : (
        <div className="w-32 h-12 animate-pulse bg-border rounded" />
      )}
    </div>
  );
}
