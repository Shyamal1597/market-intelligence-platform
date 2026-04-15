"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Globe } from "lucide-react";
import { REGION_ORDER } from "@/lib/yahoo-finance";

interface GlobalQuote {
  symbol: string;
  label: string;
  region: string;
  price: number;
  change: number;
  changePercent: number;
}

function fmt(price: number, symbol: string): string {
  if (["^TNX", "^INBY10", "^VIX"].includes(symbol)) return price.toFixed(2) + "%";
  if (["DX-Y.NYB"].includes(symbol)) return price.toFixed(2);
  if (["CL=F", "BZ=F"].includes(symbol)) return "$" + price.toFixed(2);
  if (price > 100000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (price > 1000) return price.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return price.toFixed(2);
}

function fmtChange(val: number, symbol: string): string {
  const prefix = val >= 0 ? "+" : "";
  if (["^TNX", "^INBY10", "^VIX"].includes(symbol)) return prefix + val.toFixed(2);
  if (Math.abs(val) > 100) return prefix + Math.round(val).toLocaleString("en-IN");
  return prefix + val.toFixed(2);
}

function IndexRow({ q }: { q: GlobalQuote }) {
  const up = q.changePercent >= 0;
  return (
    <div className="flex items-center gap-2 py-[5px] border-b border-[#1E2235]/60 last:border-0 group hover:bg-white/[0.02] transition-colors px-2 rounded">
      <span className="flex-1 text-[15px] font-mono text-[#C8C4BC] tracking-wide truncate group-hover:text-primary transition-colors">
        {q.label}
      </span>
      <span className="w-[80px] text-right text-[15px] font-mono text-primary font-medium tabular-nums">
        {fmt(q.price, q.symbol)}
      </span>
      <span className={`w-[58px] text-right text-[15px] font-mono tabular-nums ${up ? "text-teal" : "text-danger"}`}>
        {fmtChange(q.change, q.symbol)}
      </span>
      <span className={`w-[52px] text-right text-[15px] font-mono font-semibold tabular-nums ${up ? "text-teal" : "text-danger"}`}>
        {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 py-[5px] border-b border-[#1E2235]/60 last:border-0 px-2">
      <div className="flex-1 h-3 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[80px] h-3 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[58px] h-3 bg-[#1E2235] rounded animate-pulse" />
      <div className="w-[52px] h-3 bg-[#1E2235] rounded animate-pulse" />
    </div>
  );
}

function RegionBlock({ region, quotes, loading }: { region: string; quotes: GlobalQuote[]; loading: boolean }) {
  if (!loading && quotes.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
        <span className="text-[15px] font-mono font-bold tracking-[0.15em] uppercase text-muted">{region}</span>
        <div className="flex-1 h-px bg-[#1E2235]" />
      </div>
      {loading
        ? Array.from({ length: region === "Asia Pacific" ? 10 : region === "Others" ? 7 : 3 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))
        : quotes.map((q) => <IndexRow key={q.symbol} q={q} />)}
    </div>
  );
}

export function GlobalMarkets() {
  const [quotes, setQuotes] = useState<GlobalQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/macro/global");
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 90000);
    return () => clearInterval(i);
  }, [load]);

  const byRegion = (region: string) => quotes.filter((q) => q.region === region);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2235]">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-amber" />
          <span className="text-xl font-mono font-semibold text-primary uppercase tracking-widest">Global Markets</span>
          {fetchedAt && (
            <span className="text-[15px] font-mono text-muted ml-1">
              · {new Date(fetchedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-muted hover:text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content: 3-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1E2235]">

        {/* Col 1: Others + US + Latin America */}
        <div className="p-2">
          <RegionBlock region="Others" quotes={byRegion("Others")} loading={loading} />
          <RegionBlock region="US" quotes={byRegion("US")} loading={loading} />
          <RegionBlock region="Latin America" quotes={byRegion("Latin America")} loading={loading} />
        </div>

        {/* Col 2: Europe + India */}
        <div className="p-2">
          <RegionBlock region="Europe" quotes={byRegion("Europe")} loading={loading} />
          <RegionBlock region="India" quotes={byRegion("India")} loading={loading} />
        </div>

        {/* Col 3: Asia Pacific */}
        <div className="p-2">
          <RegionBlock region="Asia Pacific" quotes={byRegion("Asia Pacific")} loading={loading} />
        </div>
      </div>
    </div>
  );
}
