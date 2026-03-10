"use client";

import { useEffect, useState } from "react";
import type { ReportMeta } from "@/lib/reportTypes";
import { AnalystScorecard } from "@/components/analyst/AnalystScorecard";
import { CoverageTable } from "@/components/analyst/CoverageTable";

export default function AnalystPage() {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const meta: ReportMeta[] = await fetch("/api/reports/metadata").then((r) => r.json());
      setReports(meta);

      // Fetch live prices for all unique symbols that have one
      const symbols = [...new Set(meta.map((m) => m.symbol).filter(Boolean))];
      const prices: Record<string, number> = {};
      await Promise.allSettled(
        symbols.map(async (sym) => {
          try {
            const data = await fetch(`/api/quote/${sym}`).then((r) => r.json());
            // Use previousClose — stable closing price, not live tick
            const px = data?.previousClose ?? data?.price;
            if (px && px > 0) prices[sym] = px;
          } catch {
            // ignore
          }
        })
      );
      setLivePrices(prices);
      setLoading(false);
    }
    load();
  }, []);

  const analysts = [...new Set(reports.map((r) => r.analyst))].sort();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-border rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-surface border border-border rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-surface border border-border rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-5">
        <h1 className="text-2xl font-display text-primary">Analyst Performance</h1>
        <p className="text-xs font-mono text-muted mt-1">
          {reports.length} reports across {analysts.length} analysts · upside calculated from prev close
        </p>
      </div>

      {/* Scorecards grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {analysts.map((analyst) => (
          <AnalystScorecard
            key={analyst}
            analyst={analyst}
            reports={reports.filter((r) => r.analyst === analyst)}
            livePrices={livePrices}
          />
        ))}
      </div>

      {/* Full coverage table */}
      <CoverageTable reports={reports} livePrices={livePrices} />
    </div>
  );
}
