"use client";

import { useEffect, useState } from "react";

interface ShareholdingCategory {
  category: string;
  percentage: number;
}

interface Props {
  symbol: string;
  bseCode: string;
}

export function ShareholdingPanel({ symbol, bseCode }: Props) {
  const [data, setData] = useState<ShareholdingCategory[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bseCode) {
      setLoading(false);
      return;
    }
    fetch(`/api/shareholding/${symbol}?bseCode=${bseCode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!raw) {
          setLoading(false);
          return;
        }
        const arr: unknown[] = Array.isArray(raw)
          ? raw
          : (raw?.ShareHoldingList ?? raw?.data ?? []);
        const categories: ShareholdingCategory[] = (arr as Record<string, unknown>[])
          .map((item) => ({
            category: String(
              item.category ?? item.CategoryName ?? item.Category ?? ""
            ),
            percentage: parseFloat(
              String(item.percentage ?? item.Percentage ?? 0)
            ),
          }))
          .filter((c) => c.category && c.percentage > 0);
        setData(categories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol, bseCode]);

  const COLORS: Record<string, string> = {
    promoter: "#F5820D",
    fii: "#00C9A7",
    dii: "#3B82F6",
    public: "#7A8099",
  };

  function colorFor(cat: string): string {
    const lower = cat.toLowerCase();
    if (lower.includes("promoter")) return COLORS.promoter;
    if (lower.includes("fii") || lower.includes("foreign")) return COLORS.fii;
    if (
      lower.includes("dii") ||
      lower.includes("mutual") ||
      lower.includes("insurance")
    )
      return COLORS.dii;
    return COLORS.public;
  }

  if (loading)
    return <div className="animate-pulse h-32 bg-border rounded-xl" />;

  if (!bseCode)
    return (
      <div className="border border-border rounded-xl bg-surface p-4">
        <h3 className="text-xs font-mono text-muted tracking-widest mb-2 uppercase">
          Shareholding
        </h3>
        <p className="text-muted text-xs font-mono">
          BSE code not configured. Edit via Coverage Details below.
        </p>
      </div>
    );

  if (!data || data.length === 0)
    return (
      <div className="border border-border rounded-xl bg-surface p-4">
        <h3 className="text-xs font-mono text-muted tracking-widest mb-2 uppercase">
          Shareholding
        </h3>
        <p className="text-muted text-xs font-mono">Data unavailable.</p>
      </div>
    );

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <h3 className="text-xs font-mono text-muted tracking-widest mb-3 uppercase">
        Shareholding Pattern
      </h3>
      {/* Stacked bar */}
      <div className="flex h-5 rounded overflow-hidden mb-3">
        {data.map((c) => (
          <div
            key={c.category}
            style={{ width: `${c.percentage}%`, background: colorFor(c.category) }}
            title={`${c.category}: ${c.percentage}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="space-y-1.5">
        {data.map((c) => (
          <div key={c.category} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: colorFor(c.category) }}
              />
              <span className="text-xs font-mono text-muted">{c.category}</span>
            </div>
            <span className="text-xs font-mono text-primary">
              {c.percentage.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
