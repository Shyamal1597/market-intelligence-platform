"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from "recharts";

interface HistoryPoint { date: string; amtFinancedLakhs: number | null; close: number | null; }

function fmtLakhs(v: number | null): string {
  if (v === null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const amt = payload.find((p: any) => p.dataKey === "amtFinancedLakhs")?.value ?? null;
  const price = payload.find((p: any) => p.dataKey === "close")?.value ?? null;
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded px-2.5 py-2 text-[11px] font-mono text-[#F0EDE8]">
      <p className="font-bold mb-1">{label}</p>
      <p style={{ color: "#F5820D" }}>MTF financed: {fmtLakhs(amt)}</p>
      <p style={{ color: "#00C9A7" }}>Close price: {price !== null ? `₹${price.toLocaleString("en-IN")}` : "—"}</p>
    </div>
  );
}

export function SymbolDrilldown({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    setHistory(null);
    fetch(`/api/mtf/symbol/${symbol}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]));
  }, [symbol]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">{symbol} — Margin Financing vs Price</h2>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>
        {!history ? (
          <div className="py-16 text-center text-muted font-mono text-sm animate-pulse">Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-muted font-mono text-sm">No history yet for this symbol.</div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-2 text-[10px] font-mono">
              <span className="flex items-center gap-1.5" style={{ color: "#F5820D" }}>
                <span className="w-2 h-0.5 inline-block" style={{ background: "#F5820D" }} /> MTF Financed (₹ Lakhs) — left axis
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "#00C9A7" }}>
                <span className="w-2 h-0.5 inline-block" style={{ background: "#00C9A7" }} /> Close Price (₹) — right axis
              </span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={history} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#1E2235" />
                <XAxis dataKey="date" tick={{ fill: "#6E7590", fontSize: 10 }} />
                <YAxis yAxisId="amt" tick={{ fill: "#F5820D", fontSize: 10 }}>
                  <Label value="₹ Lakhs" angle={-90} position="insideLeft" offset={10} style={{ fill: "#F5820D", fontSize: 10, textAnchor: "middle" }} />
                </YAxis>
                <YAxis yAxisId="price" orientation="right" tick={{ fill: "#00C9A7", fontSize: 10 }}>
                  <Label value="₹ / share" angle={90} position="insideRight" offset={10} style={{ fill: "#00C9A7", fontSize: 10, textAnchor: "middle" }} />
                </YAxis>
                <Tooltip content={<CustomTooltip />} />
                <Line yAxisId="amt" type="monotone" dataKey="amtFinancedLakhs" stroke="#F5820D" strokeWidth={1.5} dot={false} name="MTF ₹L" />
                <Line yAxisId="price" type="monotone" dataKey="close" stroke="#00C9A7" strokeWidth={1.5} dot={false} name="Close" />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
