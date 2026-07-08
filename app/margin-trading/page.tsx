"use client";

import { useState, useEffect, useCallback } from "react";
import { MtfUpload } from "@/components/mtf/MtfUpload";
import { BreadthTiles } from "@/components/mtf/BreadthTiles";

type Scope = "all" | "coverage";

interface DashboardData {
  scope: Scope;
  breadth: {
    date: string | null; totalAmtToday: number; totalAmtYesterday: number | null;
    countUp: number; countDown: number; countFlat: number; totalSymbols: number;
    aggregateTurnoverFinancedPct: number | null;
  };
  moversUp: any[];
  moversDown: any[];
  quadrant: any[];
  turnoverLeaders: any[];
}

export default function MarginTradingPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/mtf/dashboard?scope=${scope}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-primary">Margin Trading</h1>
        <MtfUpload onComplete={load} />
      </div>

      <div className="flex items-center gap-0.5 bg-base rounded-lg p-0.5 border border-border/60 w-fit">
        <button
          onClick={() => setScope("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${scope === "all" ? "bg-surface text-amber shadow-sm border border-amber/25" : "text-muted hover:text-primary"}`}
        >
          All (~2000)
        </button>
        <button
          onClick={() => setScope("coverage")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${scope === "coverage" ? "bg-surface text-amber shadow-sm border border-amber/25" : "text-muted hover:text-primary"}`}
        >
          My Coverage
        </button>
      </div>

      {loading && (
        <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm animate-pulse">
          Loading margin trading data…
        </div>
      )}

      {!loading && data && data.breadth.date === null && (
        <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm">
          No data ingested yet. Upload a Margin Trading Volume Wise Report to get started.
        </div>
      )}

      {!loading && data && data.breadth.date !== null && (
        <BreadthTiles {...data.breadth} />
      )}

      {/* Movers table, quadrant chart, turnover leaderboard, drill-down: Tasks 10-13 */}
    </div>
  );
}
