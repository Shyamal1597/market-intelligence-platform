"use client";

import { useMemo, useState } from "react";
import { Sparkline } from "@/components/macro/Sparkline";
import { SortHeader, compareNullable, type SortDir } from "./SortHeader";

interface PriceMoverRow {
  symbol: string; name: string | null;
  priceCont: number; cont: number | null;
  amtChangePct: number | null; priceChangePct: number | null;
  amtToday: number | null; priceToday: number | null; sparkline: number[];
}

type SortField = "symbol" | "priceCont" | "cont" | "amtChangePct" | "priceChangePct";

export function PriceMoversTable({
  up, down, onSelectSymbol,
}: { up: PriceMoverRow[]; down: PriceMoverRow[]; onSelectSymbol?: (symbol: string) => void }) {
  const [tab, setTab] = useState<"up" | "down">("up");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const rows = tab === "up" ? up : down;

  const displayRows = useMemo(() => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
      if (sortField === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return compareNullable(a[sortField], b[sortField], sortDir);
    });
  }, [rows, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "symbol" ? "asc" : "desc");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col h-[560px]">
      <div className="flex items-center gap-0.5 p-2 border-b border-border/60 shrink-0">
        <button
          onClick={() => setTab("up")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${tab === "up" ? "bg-teal/10 text-teal border border-teal/25" : "text-muted hover:text-primary"}`}
        >
          Price Up ({up.length})
        </button>
        <button
          onClick={() => setTab("down")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${tab === "down" ? "bg-danger/10 text-danger border border-danger/25" : "text-muted hover:text-primary"}`}
        >
          Price Down ({down.length})
        </button>
      </div>
      <p className="text-[9px] text-muted/60 px-3 py-1.5 border-b border-border/40 shrink-0">
        Price Movers -- the report&rsquo;s own persistence count for the STOCK PRICE itself, independent of its
        MTF-financing trend (shown alongside as &ldquo;MTF Cont.&rdquo; for comparison). A stock can show up here with
        a persistently {tab === "up" ? "rising" : "falling"} price even if financing is flat or moving the other way.
        Default order is by price count, highest first -- click any column to re-sort.
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
              <SortHeader label="Symbol" field="symbol" active={sortField === "symbol"} dir={sortDir} onClick={toggleSort} align="left" />
              <SortHeader label="Price Cont." field="priceCont" active={sortField === "priceCont"} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="MTF Cont." field="cont" active={sortField === "cont"} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="Price Chg %" field="priceChangePct" active={sortField === "priceChangePct"} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="MTF Chg %" field="amtChangePct" active={sortField === "amtChangePct"} dir={sortDir} onClick={toggleSort} />
              <th className="text-right font-normal px-2 py-1.5">Trend</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-muted">
                  No stocks qualify right now.
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onSelectSymbol?.(r.symbol)}
                  className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <td className="px-2 py-1.5 text-primary">
                    {r.symbol}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${tab === "up" ? "text-teal" : "text-danger"}`}>
                    {r.priceCont}/5
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                    {r.cont != null ? `${r.cont}/5` : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${(r.priceChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                    {r.priceChangePct != null ? `${r.priceChangePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${(r.amtChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                    {r.amtChangePct != null ? `${r.amtChangePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <Sparkline data={r.sparkline} positive={tab === "up"} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
