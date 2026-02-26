"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "@/components/macro/Sparkline";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  history: number[];
}

/** Format price by symbol type — mirrors MacroTiles logic */
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(1);
  if (price > 10000)
    return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function MetricTile({ quote }: { quote: Quote }) {
  const up = quote.changePercent >= 0;
  const valueColor = up ? "text-teal" : "text-danger";
  const borderColor = up ? "border-teal" : "border-danger";

  return (
    <div
      className={`bg-surface border border-[#1E2235] border-l-2 ${borderColor} rounded-xl p-4 hover:bg-white/[0.02] transition-colors flex flex-col justify-between`}
    >
      <div>
        <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-1.5">
          {quote.label}
        </p>
        <p className="font-mono text-xl font-bold text-primary leading-none mb-1">
          {formatPrice(quote.price, quote.symbol)}
        </p>
        <p className={`font-mono text-xs ${valueColor} flex items-center gap-1`}>
          {up ? (
            <TrendingUp className="w-3 h-3 shrink-0" />
          ) : (
            <TrendingDown className="w-3 h-3 shrink-0" />
          )}
          {up ? "+" : ""}
          {quote.change.toFixed(2)}&nbsp;&nbsp;{up ? "+" : ""}
          {quote.changePercent.toFixed(2)}%
        </p>
      </div>
      {quote.history && quote.history.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={quote.history} positive={up} />
        </div>
      )}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="bg-surface border border-[#1E2235] rounded-xl p-4 animate-pulse h-[120px]" />
  );
}

export function MetricsRow() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => {
        setQuotes(d.quotes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tiles = loading
    ? Array.from({ length: 5 })
    : quotes.slice(0, 5);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {loading
        ? tiles.map((_, i) => <SkeletonTile key={i} />)
        : (tiles as Quote[]).map((q) => <MetricTile key={q.symbol} quote={q} />)}
    </div>
  );
}
