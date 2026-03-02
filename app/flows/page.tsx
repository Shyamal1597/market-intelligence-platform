"use client";

import { useEffect, useState } from "react";
import { FlowSnapshotCard } from "@/components/flows/FlowSnapshotCard";
import { FlowChart } from "@/components/flows/FlowChart";
import { FlowSummaryStrip } from "@/components/flows/FlowSummaryStrip";
import type { FiiDiiEntry, FlowsSnapshot, NiftyDayClose } from "@/lib/nse-flows";

interface FlowsData {
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: NiftyDayClose[];
  fetchedAt: string;
}

export default function FlowsPage() {
  const [data, setData] = useState<FlowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/flows", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((d: FlowsData) => {
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Could not load flow data.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const snap = data?.snapshot;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            FII / DII Flows
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-teal border border-teal/30 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-muted text-sm font-sans">
          Institutional equity &amp; debt flows · NSE data · 1-year view
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-32 bg-surface rounded-xl border border-[#1E2235]"
              />
            ))}
          </div>
          <div className="animate-pulse h-[420px] bg-surface rounded-xl border border-[#1E2235]" />
          <div className="animate-pulse h-32 bg-surface rounded-xl border border-[#1E2235]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Row 1: Snapshot cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FlowSnapshotCard
              label="FII Equity"
              buy={snap?.fiiEquityBuy ?? 0}
              sell={snap?.fiiEquitySell ?? 0}
              net={snap?.fiiEquityNet ?? 0}
            />
            <FlowSnapshotCard
              label="DII Equity"
              buy={snap?.diiEquityBuy ?? 0}
              sell={snap?.diiEquitySell ?? 0}
              net={snap?.diiEquityNet ?? 0}
            />
            <FlowSnapshotCard
              label="FII Debt"
              buy={snap?.fiiDebtBuy ?? 0}
              sell={snap?.fiiDebtSell ?? 0}
              net={snap?.fiiDebtNet ?? 0}
            />
            <FlowSnapshotCard
              label="DII Debt"
              buy={snap?.diiDebtBuy ?? 0}
              sell={snap?.diiDebtSell ?? 0}
              net={snap?.diiDebtNet ?? 0}
            />
          </div>

          {/* Row 2: Chart */}
          {data && data.entries.length > 0 ? (
            <div className="border border-[#1E2235] rounded-xl bg-surface p-5">
              <FlowChart entries={data.entries} nifty={data.nifty} />
            </div>
          ) : (
            <div className="border border-[#1E2235] rounded-xl bg-surface p-8 text-center text-muted font-mono text-sm">
              No historical data available
            </div>
          )}

          {/* Row 3: Summary strip */}
          {data && data.entries.length > 0 && (
            <FlowSummaryStrip entries={data.entries} />
          )}
        </div>
      )}
    </div>
  );
}
