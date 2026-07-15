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
import { SymbolListModal } from "@/components/mtf/SymbolListModal";

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

interface ListRow {
  symbol: string; name: string | null;
  amtToday: number | null; amtChangePct: number | null; priceChangePct: number | null;
}

type ListModalState =
  | { type: "breadth"; direction: "up" | "down" | "flat" }
  | { type: "sector"; sector: string }
  | null;

export default function MarginTradingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [listModal, setListModal] = useState<ListModalState>(null);
  const [listRows, setListRows] = useState<ListRow[] | null>(null);
  const [listLoading, setListLoading] = useState(false);

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

  useEffect(() => {
    if (!listModal) return;
    const controller = new AbortController();
    setListLoading(true);
    setListRows(null);
    const url = listModal.type === "breadth"
      ? `/api/mtf/breadth/${listModal.direction}`
      : `/api/mtf/sector/${encodeURIComponent(listModal.sector)}`;
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { setListRows(d.rows); setListLoading(false); })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setListRows([]);
        setListLoading(false);
      });
    return () => controller.abort();
  }, [listModal]);

  const listModalTitle = listModal
    ? listModal.type === "breadth"
      ? listModal.direction === "up" ? "Leveraging Up" : listModal.direction === "down" ? "Deleveraging" : "Unchanged"
      : listModal.sector
    : "";

  const listModalCaption = listModal?.type === "breadth"
    ? "Every symbol from the full universe in this bucket, not just top movers -- count matches the tile exactly."
    : listModal?.type === "sector"
      ? "Every tradeable symbol in this sector, sorted by today's financed amount."
      : undefined;

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
            onSelectBreadth={(direction) => setListModal({ type: "breadth", direction })}
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
            onSelectSector={(sector) => setListModal({ type: "sector", sector })}
          />
        </>
      )}

      {listModal && (
        <SymbolListModal
          title={listModalTitle}
          caption={listModalCaption}
          rows={listRows}
          loading={listLoading}
          onClose={() => setListModal(null)}
          onSelectSymbol={(symbol) => { setListModal(null); setSelectedSymbol(symbol); }}
        />
      )}

      {selectedSymbol && (
        <SymbolDrilldown symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      )}
    </div>
  );
}
