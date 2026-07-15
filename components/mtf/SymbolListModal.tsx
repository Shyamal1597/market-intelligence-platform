"use client";

import { X } from "lucide-react";

interface Row {
  symbol: string;
  name: string | null;
  amtToday: number | null;
  amtChangePct: number | null;
  priceChangePct: number | null;
}

function fmtLakhs(v: number | null): string {
  if (v == null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

export function SymbolListModal({
  title, caption, rows, loading, onClose, onSelectSymbol,
}: {
  title: string;
  caption?: string;
  rows: Row[] | null;
  loading: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1 shrink-0">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>
        {caption && <p className="text-[10px] text-muted/70 mb-3 shrink-0">{caption}</p>}

        {loading || !rows ? (
          <div className="py-16 text-center text-muted font-mono text-sm animate-pulse">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-muted font-mono text-sm">No symbols in this bucket.</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
                  <th className="text-left font-normal px-2 py-1.5">Symbol</th>
                  <th className="text-left font-normal px-2 py-1.5">Name</th>
                  <th className="text-right font-normal px-2 py-1.5">MTF Chg %</th>
                  <th className="text-right font-normal px-2 py-1.5">Price Chg %</th>
                  <th className="text-right font-normal px-2 py-1.5">MTF Book</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    onClick={() => onSelectSymbol(r.symbol)}
                    className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-2 py-1.5 text-primary">{r.symbol}</td>
                    <td className="px-2 py-1.5 text-muted truncate max-w-[220px]">{r.name ?? "—"}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${(r.amtChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                      {r.amtChangePct != null ? `${r.amtChangePct >= 0 ? "+" : ""}${r.amtChangePct.toFixed(2)}%` : "—"}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${(r.priceChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                      {r.priceChangePct != null ? `${r.priceChangePct >= 0 ? "+" : ""}${r.priceChangePct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted tabular-nums">{fmtLakhs(r.amtToday)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
