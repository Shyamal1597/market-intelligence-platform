"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (symbol === "BZ=F" || symbol === "GC=F") return price.toFixed(1);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function TickerItem({ quote }: { quote: Quote }) {
  const up = quote.change >= 0;
  return (
    <div className="flex items-center gap-2 px-4 py-1 border-r border-[#1E2235] shrink-0">
      <span className="text-xs text-muted font-sans">{quote.label}</span>
      <span className="text-sm font-mono text-primary font-medium">
        {formatPrice(quote.price, quote.symbol)}
      </span>
      <span
        className={`flex items-center gap-0.5 text-xs font-mono ${
          up ? "text-teal" : "text-danger"
        }`}
      >
        {up ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {up ? "+" : ""}
        {quote.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export function TickerStrip() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const fetchQuotes = async () => {
    try {
      const res = await fetch("/api/macro");
      if (!res.ok) return;
      const data = await res.json();
      setQuotes(data.quotes ?? []);
    } catch {
      // silent fail — ticker is cosmetic
    }
  };

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, []);

  if (quotes.length === 0) return null;

  return (
    <div className="h-9 flex items-center overflow-x-auto bg-base border-b border-[#1E2235] no-scrollbar shrink-0">
      {quotes.map((q) => (
        <TickerItem key={q.symbol} quote={q} />
      ))}
    </div>
  );
}
