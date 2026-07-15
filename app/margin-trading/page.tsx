"use client";

import { useState, useEffect, useCallback } from "react";
import { MtfUpload } from "@/components/mtf/MtfUpload";
import { BreadthTiles } from "@/components/mtf/BreadthTiles";
import { MoversTable } from "@/components/mtf/MoversTable";
import { MTFHeatmap } from "@/components/mtf/MTFHeatmap";
import { TurnoverLeaderboard } from "@/components/mtf/TurnoverLeaderboard";
import { SectorBreakdown } from "@/components/mtf/SectorBreakdown";
import { DivergencePanel } from "@/components/mtf/DivergencePanel";
import { SymbolDrilldown } from "@/components/mtf/SymbolDrilldown";

interface Breadth {
  date: string | null; totalAmtToday: number; totalAmtYesterday: number | null;
  countUp: number; countDown: number; countFlat: number; totalSymbols: number;
  aggregateTurnoverFinancedPct: number | null;
  avgTurnoverFinancedPct: number | null;
}

interface MoverRow {
  symbol: string; name: string | null;
  amtChangePct: number | null; priceChangePct: number | null;
  amtToday: number | null; sparkline: number[];
}

interface HeatmapNode {
  symbol: string; name: string | null; amtToday: number;
  amtChangePct: number | null; priceChangePct: number | null; turnoverLakhs: number | null;
}

interface TurnoverRow {
  symbol: string; name: string | null;
  turnoverFinancedPct: number | null; amtToday: number | null;
}

interface SectorRow {
  sector: string; amtToday: number; amtYesterday: number;
  amtChangePct: number | null; symbolCount: number;
}

interface DivergenceRow {
  symbol: string; name: string | null;
  amtChangePct: number; priceChangePct: number; amtToday: number | null;
  pattern: "leverage-up-price-down" | "leverage-down-price-up";
}

interface DashboardData {
  breadth: Breadth;
  moversUp: MoverRow[];
  moversDown: MoverRow[];
  heatmap: HeatmapNode[];
  turnoverLeaders: TurnoverRow[];
  sectorBreakdown: SectorRow[];
  unclassifiedAmt: number;
  unclassifiedCount: number;
  divergence: DivergenceRow[];
}

export default function MarginTradingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    fetch("/api/mtf/dashboard", { signal })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const topGainer = data && data.moversUp.length > 0
    ? { symbol: data.moversUp[0].symbol, amtChangePct: data.moversUp[0].amtChangePct as number }
    : null;
  const topLoser = data && data.moversDown.length > 0
    ? { symbol: data.moversDown[0].symbol, amtChangePct: data.moversDown[0].amtChangePct as number }
    : null;

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-primary">Margin Trading</h1>
        <MtfUpload onComplete={load} />
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

      {!loading && error && (
        <div className="rounded border border-border bg-surface p-12 text-center text-danger font-mono text-sm">
          Failed to load margin trading data. Please try again.
        </div>
      )}

      {!loading && data && data.breadth.date !== null && (
        <>
          <BreadthTiles
            {...data.breadth}
            topGainer={topGainer}
            topLoser={topLoser}
            onSelectSymbol={setSelectedSymbol}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-5">
              <MoversTable up={data.moversUp} down={data.moversDown} onSelectSymbol={setSelectedSymbol} />
            </div>
            <div className="xl:col-span-4">
              <MTFHeatmap nodes={data.heatmap} onSelectSymbol={setSelectedSymbol} />
            </div>
            <div className="xl:col-span-3">
              <TurnoverLeaderboard rows={data.turnoverLeaders} onSelectSymbol={setSelectedSymbol} />
            </div>
          </div>

          <DivergencePanel rows={data.divergence} onSelectSymbol={setSelectedSymbol} />

          <SectorBreakdown
            rows={data.sectorBreakdown}
            unclassifiedAmt={data.unclassifiedAmt}
            unclassifiedCount={data.unclassifiedCount}
          />
        </>
      )}

      {selectedSymbol && (
        <SymbolDrilldown symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      )}
    </div>
  );
}
