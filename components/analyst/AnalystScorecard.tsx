"use client";

import type { ReportMeta } from "@/lib/reportTypes";

interface Props {
  analyst: string;
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

// Classify rating direction: +1 = bullish call, -1 = bearish call, 0 = neutral/unknown
function ratingDirection(rating: string): 1 | -1 | 0 {
  const r = rating.toLowerCase();
  if (r.includes("buy") || r.includes("outperform") || r.includes("add") || r.includes("accumulate") || r.includes("overweight")) return 1;
  if (r.includes("sell") || r.includes("underperform") || r.includes("reduce") || r.includes("underweight")) return -1;
  return 0; // hold, neutral, not rated
}

export function AnalystScorecard({ analyst, reports, livePrices }: Props) {
  const totalCalls = reports.length;

  // ── Directional accuracy ──────────────────────────────────────────────────
  // A "hit" = stock moved in the direction the analyst predicted, measured
  // from the CMP at time of report vs current price.
  // Only include reports where we have both r.cmp > 0 and a live price.
  const directionalReports = reports.filter((r) => {
    const live = r.symbol ? livePrices[r.symbol] : null;
    return live && r.cmp > 0 && ratingDirection(r.rating) !== 0;
  });

  const hits = directionalReports.filter((r) => {
    const live = livePrices[r.symbol];
    const dir = ratingDirection(r.rating);
    return dir === 1 ? live > r.cmp : live < r.cmp;
  });

  const hitRate =
    directionalReports.length > 0
      ? ((hits.length / directionalReports.length) * 100).toFixed(0)
      : null;

  // ── Avg return since issue ────────────────────────────────────────────────
  // (currentPrice - cmpAtIssue) / cmpAtIssue × 100, averaged
  const returnReports = reports.filter((r) => {
    const live = r.symbol ? livePrices[r.symbol] : null;
    return live && r.cmp > 0;
  });

  const avgReturn =
    returnReports.length > 0
      ? returnReports.reduce((sum, r) => {
          const live = livePrices[r.symbol];
          return sum + ((live - r.cmp) / r.cmp) * 100;
        }, 0) / returnReports.length
      : null;

  // ── Remaining upside to target ────────────────────────────────────────────
  // (targetPrice - currentPrice) / currentPrice × 100, averaged across BUY calls
  const upsideReports = reports.filter((r) => {
    const live = r.symbol ? livePrices[r.symbol] : null;
    return live && r.targetPrice > 0 && ratingDirection(r.rating) === 1;
  });

  const avgUpside =
    upsideReports.length > 0
      ? upsideReports.reduce((sum, r) => {
          const live = livePrices[r.symbol];
          return sum + ((r.targetPrice - live) / live) * 100;
        }, 0) / upsideReports.length
      : null;

  const initials = analyst
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function PctStat({ value, label, neutral }: { value: number | null; label: string; neutral?: boolean }) {
    if (value === null) {
      return (
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-lg font-mono text-muted">—</div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">{label}</div>
        </div>
      );
    }
    const color = neutral
      ? "text-primary"
      : value > 0 ? "text-teal" : value < 0 ? "text-danger" : "text-primary";
    const prefix = !neutral && value > 0 ? "+" : "";
    return (
      <div className="bg-background rounded-lg p-2 text-center">
        <div className={`text-lg font-mono ${color}`}>
          {prefix}{value.toFixed(1)}%
        </div>
        <div className="text-[9px] font-mono text-muted tracking-wider uppercase">{label}</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-amber/20 flex items-center justify-center text-amber text-sm font-mono font-bold shrink-0">
          {initials}
        </div>
        <div>
          <div className="text-sm font-mono text-primary leading-tight">{analyst}</div>
          <div className="text-[10px] font-mono text-muted">
            {totalCalls} reports · {directionalReports.length} tracked
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Hit rate — directional accuracy */}
        <div className="bg-background rounded-lg p-2 text-center">
          <div className={`text-lg font-mono ${
            hitRate === null ? "text-muted" :
            Number(hitRate) >= 60 ? "text-teal" :
            Number(hitRate) >= 40 ? "text-amber" : "text-danger"
          }`}>
            {hitRate !== null ? `${hitRate}%` : "—"}
          </div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">Hit Rate</div>
        </div>

        {/* Avg return since issue */}
        <PctStat value={avgReturn ?? null} label="Avg Return" />

        {/* Avg remaining upside on active BUY calls */}
        <PctStat value={avgUpside ?? null} label="Avg Upside" />
      </div>

      {/* Method note */}
      <p className="text-[8px] font-mono text-muted/50 mt-2 leading-tight">
        Hit rate = % calls price moved in rated direction vs CMP at issue
      </p>
    </div>
  );
}
