"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { GlobalMarkets } from "@/components/macro/GlobalMarkets";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  history: number[];
}

const INDIA_MACRO = [
  { label: "RBI Repo Rate", value: "6.50%", note: "As of Feb 2025" },
  { label: "CPI Inflation", value: "5.22%", note: "Jan 2026" },
  { label: "IIP Growth", value: "3.8%", note: "Nov 2025" },
];

const GLOBAL_MACRO = [
  { label: "US 10Y Yield", value: "4.42%", note: "Approx — check FRED" },
  { label: "DXY (Dollar Index)", value: "107.2", note: "Approx — check Bloomberg" },
  { label: "CBOE VIX", value: "16.8", note: "Approx — check CBOE" },
];

// ── Groups for the live terminal ───────────────────────────────────────────────
const LIVE_GROUPS: Record<string, string[]> = {
  India:       ["^NSEI", "^BSESN", "^NSEBANK", "^INDIAVIX"],
  Commodities: ["BZ=F", "GOLD_INR", "SILVER_INR"],
  FX:          ["INR=X"],
};

function fmtPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(4);
  if (symbol === "^INDIAVIX") return price.toFixed(2);
  if (symbol === "BZ=F") return "$" + price.toFixed(2);
  if (["GOLD_INR", "SILVER_INR"].includes(symbol))
    return "\u20B9" + Math.round(price).toLocaleString("en-IN");
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function fmtChange(val: number, symbol: string): string {
  const p = val >= 0 ? "+" : "";
  if (["GOLD_INR", "SILVER_INR"].includes(symbol))
    return p + Math.round(val).toLocaleString("en-IN");
  if (Math.abs(val) > 100) return p + Math.round(val).toLocaleString("en-IN");
  return p + val.toFixed(2);
}

function LiveRow({ q }: { q: Quote }) {
  const up = q.changePercent >= 0;
  return (
    <div className="flex items-center gap-2 py-[5px] border-b border-[#1E2235]/60 last:border-0 group hover:bg-white/[0.02] transition-colors px-2 rounded">
      <span className="flex-1 text-[11px] font-mono text-[#C8C4BC] tracking-wide truncate group-hover:text-primary transition-colors">
        {q.label}
      </span>
      <span className="w-[100px] text-right text-[11px] font-mono text-primary font-medium tabular-nums">
        {fmtPrice(q.price, q.symbol)}
      </span>
      <span className={`w-[70px] text-right text-[10px] font-mono tabular-nums ${up ? "text-teal" : "text-danger"}`}>
        {fmtChange(q.change, q.symbol)}
      </span>
      <span className={`w-[54px] text-right text-[10px] font-mono font-semibold tabular-nums ${up ? "text-teal" : "text-danger"}`}>
        {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

function LiveSkeleton() {
  return (
    <div className="flex items-center gap-2 py-[5px] border-b border-[#1E2235]/60 last:border-0 px-2">
      <div className="flex-1 h-2.5 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[100px] h-2.5 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[70px] h-2.5 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[54px] h-2.5 bg-[#1E2235] rounded animate-pulse" />
    </div>
  );
}

export default function MacroPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/macro");
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Macro Command Centre
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">
            Live market data · auto-refreshes every 60s
            {fetchedAt && (
              <> · last updated {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>
            )}
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-[#1E2235] rounded-lg text-sm text-muted hover:text-primary hover:border-amber/30 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Live Market Quotes — terminal table */}
      <section className="mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          <span className="text-teal/80">Live Market Data</span>
          <span className="text-[#272B40]">·</span>
          <span className="text-muted">Yahoo Finance</span>
        </h2>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1E2235]">
            {Object.entries(LIVE_GROUPS).map(([group, symbols]) => (
              <div key={group} className="p-2">
                <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                  <span className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase text-muted">{group}</span>
                  <div className="flex-1 h-px bg-[#1E2235]" />
                </div>
                {loading
                  ? symbols.map((_, i) => <LiveSkeleton key={i} />)
                  : quotes
                      .filter((q) => symbols.includes(q.symbol))
                      .map((q) => <LiveRow key={q.symbol} q={q} />)
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Global Market Indices */}
      <section className="mb-10">
        <h2 className="text-xs font-mono uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          <span className="text-amber/80">Global Markets</span>
          <span className="text-[#272B40]">·</span>
          <span className="text-muted">World Indices</span>
        </h2>
        <GlobalMarkets />
      </section>

      {/* Static Macro Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-raised border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-5">India Macro</h2>
          <div className="divide-y divide-[#1E2235]">
            {INDIA_MACRO.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm text-primary font-sans">{m.label}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">{m.note}</p>
                </div>
                <span className="font-mono text-xl font-semibold text-amber">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-raised border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-5">Global Indicators</h2>
          <div className="divide-y divide-[#1E2235]">
            {GLOBAL_MACRO.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm text-primary font-sans">{m.label}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">{m.note}</p>
                </div>
                <span className="font-mono text-xl font-semibold text-teal">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
