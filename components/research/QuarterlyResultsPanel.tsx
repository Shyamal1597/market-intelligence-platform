"use client";

import { useEffect, useState } from "react";
import { EarningsChart } from "@/components/results/EarningsChart";
import type { WatchlistEntry } from "@/lib/watchlist";
import type { EarningsData } from "@/lib/earnings";

interface Props {
  entry: WatchlistEntry;
}

export function QuarterlyResultsPanel({ entry }: Props) {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/earnings/${entry.symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EarningsData | null) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [entry.symbol]);

  if (loading)
    return <div className="animate-pulse h-64 bg-border rounded-xl" />;
  if (!data)
    return (
      <p className="text-muted text-xs font-mono">No earnings data available.</p>
    );

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <h3 className="text-xs font-mono text-muted tracking-widest mb-4 uppercase">
        Quarterly Results
      </h3>
      <div style={{ height: 280 }}>
        <EarningsChart stock={entry} earnings={data} />
      </div>
      {/* Raw table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 text-muted font-normal">Quarter</th>
              <th className="text-right py-1.5 text-muted font-normal">Revenue (Cr)</th>
              <th className="text-right py-1.5 text-muted font-normal">EBIT (Cr)</th>
              <th className="text-right py-1.5 text-muted font-normal">PAT (Cr)</th>
              <th className="text-right py-1.5 text-muted font-normal">EPS (₹)</th>
            </tr>
          </thead>
          <tbody>
            {[...data.quarters].reverse().map((q) => (
              <tr
                key={q.quarterLabel}
                className="border-b border-border/50 hover:bg-white/[0.02]"
              >
                <td className="py-1.5 text-amber">{q.quarterLabel}</td>
                <td className="py-1.5 text-right text-primary">
                  {q.totalRevenue.toLocaleString("en-IN")}
                </td>
                <td className="py-1.5 text-right text-primary">
                  {q.ebit.toLocaleString("en-IN")}
                </td>
                <td className="py-1.5 text-right text-primary">
                  {q.netIncome.toLocaleString("en-IN")}
                </td>
                <td className="py-1.5 text-right text-primary">
                  {q.basicEps != null ? q.basicEps.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
