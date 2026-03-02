"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "@/components/macro/Sparkline";
import type { QuoteData } from "@/lib/yahoo-finance";

interface SectorTileProps {
  quote: QuoteData;
}

export function SectorTile({ quote }: SectorTileProps) {
  const up = quote.changePercent >= 0;
  const sign = up ? "+" : "-";
  const valueColor = up ? "text-teal" : "text-danger";

  let bgClass: string;
  let borderClass: string;

  if (quote.changePercent > 1.5) {
    bgClass = "bg-teal/10";
    borderClass = "border-l-teal";
  } else if (quote.changePercent < -1.5) {
    bgClass = "bg-danger/10";
    borderClass = "border-l-danger";
  } else {
    bgClass = "bg-surface-raised";
    borderClass = "border-l-[#1E2235]";
  }

  return (
    <div
      className={`border border-[#1E2235] border-l-2 ${bgClass} ${borderClass} rounded-xl p-4 flex flex-col justify-between transition-all hover:bg-white/[0.05]`}
    >
      <div>
        <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-1.5">
          {quote.label}
        </p>
        <p className="font-mono text-xl font-bold text-primary leading-none mb-1">
          {quote.price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </p>
        <p className={`font-mono text-xs ${valueColor} flex items-center gap-1`}>
          {up ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {sign}{Math.abs(quote.change).toFixed(0)}&nbsp;&nbsp;{sign}{Math.abs(quote.changePercent).toFixed(2)}%
        </p>
      </div>
      {quote.history?.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={quote.history} positive={up} />
        </div>
      )}
    </div>
  );
}
