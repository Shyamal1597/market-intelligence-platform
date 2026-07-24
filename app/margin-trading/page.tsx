"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { MtfUpload } from "@/components/mtf/MtfUpload";
import { MtfGlossary } from "@/components/mtf/MtfGlossary";
import { BreadthTiles } from "@/components/mtf/BreadthTiles";
import { ContinuousFundersTable } from "@/components/mtf/ContinuousFundersTable";
import { PriceMoversTable } from "@/components/mtf/PriceMoversTable";
import { MTFHeatmap } from "@/components/mtf/MTFHeatmap";
import { SectorBreakdown } from "@/components/mtf/SectorBreakdown";
import { DivergencePanel } from "@/components/mtf/DivergencePanel";
import { SymbolDrilldown } from "@/components/mtf/SymbolDrilldown";
import { SymbolListModal } from "@/components/mtf/SymbolListModal";

interface Breadth {
  date: string | null; totalAmtToday: number; totalAmtYesterday: number | null;
  countUp: number; countDown: number; countFlat: number; totalSymbols: number;
  aggregateDeliveryFinancedPct: number | null;
  avgDeliveryPct: number | null;
}

interface FunderRow {
  symbol: string; name: string | null;
  cont: number; priceCont: number | null;
  amtChangePct: number; priceChangePct: number | null;
  amtToday: number | null; sparkline: number[];
}

interface PriceMoverRow {
  symbol: string; name: string | null;
  priceCont: number; cont: number | null;
  amtChangePct: number | null; priceChangePct: number | null;
  amtToday: number | null; priceToday: number | null; sparkline: number[];
}

interface TopMover { symbol: string; amtChangePct: number }

interface HeatmapNode {
  symbol: string; name: string | null; amtToday: number;
  amtChangePct: number | null; priceChangePct: number | null; turnoverLakhs: number | null;
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
  topGainer: TopMover | null;
  topLoser: TopMover | null;
  continuousFundersUp: FunderRow[];
  continuousFundersDown: FunderRow[];
  priceMoversUp: PriceMoverRow[];
  priceMoversDown: PriceMoverRow[];
  heatmap: HeatmapNode[];
  sectorBreakdown: SectorRow[];
  unclassifiedAmt: number;
  unclassifiedCount: number;
  excludedAmt: number;
  excludedCount: number;
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
  const [exportingPdf, setExportingPdf] = useState(false);

  const exportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const res = await fetch("/api/mtf/pdf-export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed: ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "2-digit", year: "2-digit",
      }).replace(/\//g, ".");
      a.download = `MTF Market Pulse - ${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("MTF PDF export failed:", e);
      alert(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportingPdf(false);
    }
  }, []);

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

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-primary">Margin Trading</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPdf}
            disabled={exportingPdf || !data || data.breadth.date === null}
            title="Export MTF Market Pulse as PDF"
            className="flex items-center gap-2 px-4 py-2 border border-amber/40 rounded-lg text-sm text-amber hover:bg-amber/10 hover:border-amber/70 transition-all disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${exportingPdf ? "animate-bounce" : ""}`} />
            {exportingPdf ? "Generating…" : "Export PDF"}
          </button>
          <MtfUpload onComplete={load} />
        </div>
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
          <MtfGlossary />

          <BreadthTiles
            {...data.breadth}
            topGainer={data.topGainer}
            topLoser={data.topLoser}
            onSelectSymbol={setSelectedSymbol}
            onSelectBreadth={(direction) => setListModal({ type: "breadth", direction })}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ContinuousFundersTable up={data.continuousFundersUp} down={data.continuousFundersDown} onSelectSymbol={setSelectedSymbol} />
            <PriceMoversTable up={data.priceMoversUp} down={data.priceMoversDown} onSelectSymbol={setSelectedSymbol} />
          </div>

          <MTFHeatmap nodes={data.heatmap} onSelectSymbol={setSelectedSymbol} />

          <DivergencePanel rows={data.divergence} onSelectSymbol={setSelectedSymbol} />

          <SectorBreakdown
            rows={data.sectorBreakdown}
            unclassifiedAmt={data.unclassifiedAmt}
            unclassifiedCount={data.unclassifiedCount}
            excludedAmt={data.excludedAmt}
            excludedCount={data.excludedCount}
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
          onSelectSymbol={setSelectedSymbol}
        />
      )}

      {selectedSymbol && (
        <SymbolDrilldown symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      )}
    </div>
  );
}
