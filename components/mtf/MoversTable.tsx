"use client";

import { useState } from "react";
import { Sparkline } from "@/components/macro/Sparkline";

interface MoverRow {
  symbol: string; name: string | null;
  amtChangePct: number | null; priceChangePct: number | null;
  amtToday: number | null; sparkline: number[];
}

export function MoversTable({
  up, down, onSelectSymbol,
}: { up: MoverRow[]; down: MoverRow[]; onSelectSymbol?: (symbol: string) => void }) {
  const [tab, setTab] = useState<"up" | "down">("up");
  const rows = tab === "up" ? up : down;

  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col h-[560px]">
      <div className="flex items-center gap-0.5 p-2 border-b border-border/60 shrink-0">
        <button
          onClick={() => setTab("up")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${tab === "up" ? "bg-teal/10 text-teal border border-teal/25" : "text-muted hover:text-primary"}`}
        >
          Leveraging Up ({up.length})
        </button>
        <button
          onClick={() => setTab("down")}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${tab === "down" ? "bg-danger/10 text-danger border border-danger/25" : "text-muted hover:text-primary"}`}
        >
          Deleveraging ({down.length})
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
              <th className="text-left font-normal px-2 py-1.5">Symbol</th>
              <th className="text-right font-normal px-2 py-1.5">MTF Chg %</th>
              <th className="text-right font-normal px-2 py-1.5">Price Chg %</th>
              <th className="text-right font-normal px-2 py-1.5">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                onClick={() => onSelectSymbol?.(r.symbol)}
                className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-2 py-1.5 text-primary">
                  {r.symbol}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${(r.amtChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                  {r.amtChangePct?.toFixed(2)}%
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${(r.priceChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                  {r.priceChangePct != null ? `${r.priceChangePct.toFixed(2)}%` : "—"}
                </td>
                <td className="px-2 py-1.5 w-20">
                  <Sparkline data={r.sparkline} positive={(r.amtChangePct ?? 0) >= 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
