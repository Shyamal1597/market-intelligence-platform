"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface HistoryPoint { date: string; amtFinancedLakhs: number | null; close: number | null; }

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">{symbol} — MTF vs Price</h2>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>
        {!history ? (
          <div className="py-16 text-center text-muted font-mono text-sm animate-pulse">Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-muted font-mono text-sm">No history yet for this symbol.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={history}>
              <CartesianGrid stroke="#1E2235" />
              <XAxis dataKey="date" tick={{ fill: "#6E7590", fontSize: 10 }} />
              <YAxis yAxisId="amt" tick={{ fill: "#F5820D", fontSize: 10 }} />
              <YAxis yAxisId="price" orientation="right" tick={{ fill: "#00C9A7", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#13151E", border: "1px solid #1E2235", fontSize: 11 }} />
              <Line yAxisId="amt" type="monotone" dataKey="amtFinancedLakhs" stroke="#F5820D" strokeWidth={1.5} dot={false} name="MTF ₹L" />
              <Line yAxisId="price" type="monotone" dataKey="close" stroke="#00C9A7" strokeWidth={1.5} dot={false} name="Close" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
