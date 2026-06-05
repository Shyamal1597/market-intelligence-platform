"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { FlowSnapshotCard } from "@/components/flows/FlowSnapshotCard";
import { FlowChart } from "@/components/flows/FlowChart";
import { FlowSummaryStrip } from "@/components/flows/FlowSummaryStrip";
import { FlowsGapAlert } from "@/components/flows/FlowsGapAlert";
import type { FiiDiiEntry, FlowsSnapshot } from "@/lib/nse-flows";
import { computePeriodTotals } from "@/lib/flow-periods";

interface FlowsData {
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: unknown[];
  fetchedAt: string;
}

// Escape a single CSV cell — wrap in quotes if it contains comma, quote, or newline.
function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(entries: FiiDiiEntry[]): string {
  // Period totals (FII Equity Net) — computed from the same entries shown in the UI
  const totals = computePeriodTotals(entries);
  const exportedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // Section 1: header metadata + period totals
  const meta: (string | number)[][] = [
    ["Research Intelligence — FII / DII Flows"],
    ["Exported", exportedAt],
    ["Rows", entries.length],
    [],
    ["Period summary (FII Equity Net, Rs Cr)", "Period start", "Total"],
    ["MTD",                  totals.startOfMonth,   Math.round(totals.mtd)],
    ["QTD",                  totals.startOfQuarter, Math.round(totals.qtd)],
    [`${totals.fyLabel} YTD`, totals.startOfFy,      Math.round(totals.ytd)],
    [],
  ];

  // Section 2: daily history
  const headers = [
    "Date",
    "FII Equity Buy", "FII Equity Sell", "FII Equity Net",
    "DII Equity Buy", "DII Equity Sell", "DII Equity Net",
    "FII Debt Buy",   "FII Debt Sell",   "FII Debt Net",
    "DII Debt Buy",   "DII Debt Sell",   "DII Debt Net",
    "Cumulative FII Equity Net",
    "Cumulative DII Equity Net",
    "20D Avg FII Equity",
    "20D Avg DII Equity",
  ];
  const rows = entries.map((e) => [
    e.date,
    e.fiiEquityBuy, e.fiiEquitySell, e.fiiEquityNet,
    e.diiEquityBuy, e.diiEquitySell, e.diiEquityNet,
    e.fiiDebtBuy,   e.fiiDebtSell,   e.fiiDebtNet,
    e.diiDebtBuy,   e.diiDebtSell,   e.diiDebtNet,
    Math.round(e.cumulativeFiiEquityNet),
    Math.round(e.cumulativeDiiEquityNet),
    Math.round(e.rollingAvg20FiiEquity),
    Math.round(e.rollingAvg20DiiEquity),
  ]);

  return [...meta, headers, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
}

function downloadCsv(entries: FiiDiiEntry[]) {
  if (!entries.length) return;
  const csv = buildCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  a.href = url;
  a.download = `fii-dii-flows-${yyyy}-${mm}-${dd}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FlowsPage() {
  const [data, setData] = useState<FlowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function reloadFlows() {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d: FlowsData) => { setData(d); setError(null); })
      .catch(() => {});
  }

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
  const entriesCount = data?.entries.length ?? 0;
  const canExport = entriesCount > 0;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
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

        <button
          type="button"
          onClick={() => data && downloadCsv(data.entries)}
          disabled={!canExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono border border-border text-muted hover:text-amber hover:border-amber/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={canExport ? `Export ${entriesCount} rows as CSV` : "No data to export"}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
          {canExport && (
            <span className="text-[10px] text-muted">({entriesCount} rows)</span>
          )}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {/* Data quality warning — shown whenever history has gaps */}
      <div className="mb-4">
        <FlowsGapAlert onPatched={reloadFlows} />
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="animate-pulse h-32 bg-surface rounded-xl border border-border" />
            ))}
          </div>
          <div className="animate-pulse h-[420px] bg-surface rounded-xl border border-border" />
          <div className="animate-pulse h-32 bg-surface rounded-xl border border-border" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {data && data.entries.length > 0 ? (
            <div className="border border-border rounded-xl bg-surface p-5">
              <FlowChart entries={data.entries} />
            </div>
          ) : (
            <div className="border border-border rounded-xl bg-surface p-8 text-center text-muted font-mono text-sm">
              No historical data available
            </div>
          )}

          {data && data.entries.length > 0 && (
            <FlowSummaryStrip entries={data.entries} />
          )}
        </div>
      )}
    </div>
  );
}
