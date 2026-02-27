"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MetricTile } from "@/components/macro/MetricTile";

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

      {/* Live Market Quotes */}
      <section className="mb-10">
        <h2 className="text-xs font-mono uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          <span className="text-teal/80">Live Market Data</span>
          <span className="text-[#272B40]">·</span>
          <span className="text-muted">Yahoo Finance</span>
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-36 bg-surface rounded-xl border border-[#1E2235]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quotes.map((q) => (
              <MetricTile key={q.symbol} {...q} />
            ))}
          </div>
        )}
      </section>

      {/* Static Macro Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-raised border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-5">
            India Macro
          </h2>
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
          <h2 className="font-display text-xl font-semibold text-primary mb-5">
            Global Indicators
          </h2>
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
