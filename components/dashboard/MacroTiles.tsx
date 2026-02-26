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
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(1);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

export function MacroTiles() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes ?? []))
      .catch(() => {});
  }, []);

  if (quotes.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-12 bg-[#1E2235] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quotes.slice(0, 5).map((q) => {
        const up = q.change >= 0;
        return (
          <div
            key={q.symbol}
            className="flex items-center justify-between p-3 rounded-lg bg-base/60 border border-[#1E2235] hover:border-[#2A2D42] transition-colors"
          >
            <span className="text-xs text-muted font-sans uppercase tracking-wider">
              {q.label}
            </span>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-primary">
                {formatPrice(q.price, q.symbol)}
              </div>
              <div
                className={`flex items-center justify-end gap-0.5 text-xs font-mono ${
                  up ? "text-teal" : "text-danger"
                }`}
              >
                {up ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {up ? "+" : ""}
                {q.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
