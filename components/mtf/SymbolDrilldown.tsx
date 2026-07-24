"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, ReferenceLine,
} from "recharts";

interface HistoryPoint {
  date: string;
  mtfVolumeChange: number | null;
  close: number | null;
  deliveryVolume: number | null;
}

const TEAL = "#00C9A7";
const DANGER = "#E84040";
const VIOLET = "#8B7FD6";
const AMBER = "#F5820D";

function fmtShares(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("en-IN");
}

function fmtSharesSigned(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("en-IN")}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const mtfChange = payload.find((p: any) => p.dataKey === "mtfVolumeChange")?.value ?? null;
  const price = payload.find((p: any) => p.dataKey === "close")?.value ?? null;
  const deliveryVolume = payload.find((p: any) => p.dataKey === "deliveryVolume")?.value ?? null;
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded px-3 py-2.5 text-[12px] font-mono text-[#F0EDE8]">
      <p className="font-bold mb-1.5">{label}</p>
      <p style={{ color: mtfChange === null ? "#F0EDE8" : mtfChange >= 0 ? TEAL : DANGER }}>
        MTF volume Δ: {fmtSharesSigned(mtfChange)} shares
      </p>
      <p style={{ color: VIOLET }}>Delivery volume: {fmtShares(deliveryVolume)} shares</p>
      <p style={{ color: AMBER }}>Close price: {price !== null ? `₹${price.toLocaleString("en-IN")}` : "—"}</p>
    </div>
  );
}

/** Recharts' default axis tick just prints the raw share count -- add
 * thousands separators for readability at this scale (hundreds to tens of
 * thousands of shares). */
function sharesAxisTick(v: number): string {
  return v.toLocaleString("en-IN");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">{symbol} — Margin Volume vs Delivery Volume vs Price</h2>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>
        {!history ? (
          <div className="py-16 text-center text-muted font-mono text-sm animate-pulse">Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-muted font-mono text-sm">No history yet for this symbol.</div>
        ) : (
          <>
            <div className="flex items-center flex-wrap gap-x-5 gap-y-1.5 mb-1 mt-2 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2.5 h-2.5 inline-block" style={{ background: TEAL }} />
                <span className="w-2.5 h-2.5 inline-block" style={{ background: DANGER }} />
                MTF Volume Δ (shares, bar — teal = book grew, red = book shrank)
              </span>
              <span className="flex items-center gap-1.5" style={{ color: VIOLET }}>
                <span className="w-2.5 h-2.5 inline-block" style={{ background: VIOLET }} /> Delivery Volume (shares, bar)
              </span>
              <span className="flex items-center gap-1.5" style={{ color: AMBER }}>
                <span className="w-3 h-0.5 inline-block" style={{ background: AMBER }} /> Close Price (₹, line) — right axis
              </span>
            </div>
            <p className="text-[10px] text-muted/60 mb-3">
              MTF Volume Δ is the day-over-day CHANGE in shares currently financed on margin, not the outstanding balance itself -- the raw feed only reports a cumulative book figure, not a same-day financing count, so this is the closest real "for the day" number (positive = book grew, negative = book shrank). Delivery Volume is BHAVCOPY&rsquo;s own delivered-share count for that day. Both share the same LEFT axis (raw shares) so the two are directly comparable; Close Price is shown separately on the right for context.
            </p>
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={history} margin={{ top: 5, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis yAxisId="vol" domain={["auto", "auto"]} tick={{ fill: "var(--color-primary)", fontSize: 11 }} tickFormatter={sharesAxisTick} width={70}>
                  <Label value="Shares" angle={-90} position="left" style={{ fill: "var(--color-muted)", fontSize: 11, textAnchor: "middle" }} />
                </YAxis>
                <YAxis yAxisId="price" orientation="right" domain={["auto", "auto"]} tick={{ fill: AMBER, fontSize: 11 }} width={70}>
                  <Label value="₹ / share" angle={90} position="right" style={{ fill: AMBER, fontSize: 11, textAnchor: "middle" }} />
                </YAxis>
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine yAxisId="vol" y={0} stroke="var(--color-border)" />
                <Bar yAxisId="vol" dataKey="mtfVolumeChange" name="MTF Volume Δ" barSize={10}>
                  {history.map((h, i) => (
                    <Cell key={i} fill={h.mtfVolumeChange === null ? "var(--color-muted)" : h.mtfVolumeChange >= 0 ? TEAL : DANGER} />
                  ))}
                </Bar>
                <Bar yAxisId="vol" dataKey="deliveryVolume" fill={VIOLET} name="Delivery Volume" barSize={10} />
                <Line yAxisId="price" type="monotone" dataKey="close" stroke={AMBER} strokeWidth={2} dot={false} name="Close Price" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
