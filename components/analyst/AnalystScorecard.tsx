"use client";

import type { ReportMeta } from "@/lib/reportTypes";

interface Props {
  analyst: string;
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

export function AnalystScorecard({ analyst, reports, livePrices }: Props) {
  const calls = reports.length;

  // A "hit" = live CMP reached or exceeded target price
  const reportsWithLive = reports.filter((r) => r.symbol && livePrices[r.symbol]);
  const hits = reportsWithLive.filter((r) => {
    const live = livePrices[r.symbol];
    if (!live || !r.targetPrice) return false;
    return r.rating.toLowerCase().includes("outperform") || r.rating.toLowerCase().includes("buy")
      ? live >= r.targetPrice
      : live <= r.targetPrice;
  });

  const hitRate =
    reportsWithLive.length > 0
      ? ((hits.length / reportsWithLive.length) * 100).toFixed(0)
      : "—";

  const avgUpside =
    reportsWithLive.length > 0
      ? (
          reportsWithLive.reduce((sum, r) => {
            const live = livePrices[r.symbol];
            if (!live || !r.targetPrice) return sum;
            return sum + ((r.targetPrice - live) / live) * 100;
          }, 0) / reportsWithLive.length
        ).toFixed(1)
      : "—";

  const initials = analyst
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-amber/20 flex items-center justify-center text-amber text-sm font-mono font-bold shrink-0">
          {initials}
        </div>
        <div>
          <div className="text-sm font-mono text-primary leading-tight">{analyst}</div>
          <div className="text-[10px] font-mono text-muted">{calls} reports</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-lg font-mono text-primary">
            {hitRate}
            {hitRate !== "—" ? "%" : ""}
          </div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">Hit Rate</div>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <div
            className={`text-lg font-mono ${
              parseFloat(avgUpside) > 0
                ? "text-teal"
                : parseFloat(avgUpside) < 0
                ? "text-danger"
                : "text-primary"
            }`}
          >
            {avgUpside !== "—"
              ? `${parseFloat(avgUpside) > 0 ? "+" : ""}${avgUpside}%`
              : "—"}
          </div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">Avg Upside</div>
        </div>
      </div>
    </div>
  );
}
