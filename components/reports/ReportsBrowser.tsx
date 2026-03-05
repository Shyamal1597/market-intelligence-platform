"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import type { ReportMeta } from "@/lib/reportTypes";
import { encodePdfPath } from "@/lib/reportTypes";

interface Props {
  onFilterChange: (symbol: string, analyst: string) => void;
}

export function ReportsBrowser({ onFilterChange }: Props) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [analystFilter, setAnalystFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams();
    if (analystFilter) params.set("analyst", analystFilter);
    if (symbolFilter) params.set("symbol", symbolFilter);
    const data = await fetch(`/api/reports/metadata?${params}`).then((r) => r.json());
    setReports(data);
    setLoading(false);
  }

  async function reindex() {
    setIndexing(true);
    await fetch("/api/reports/index", { method: "POST" });
    setIndexing(false);
    loadReports();
  }

  useEffect(() => { loadReports(); }, [analystFilter, symbolFilter]); // eslint-disable-line

  const analysts = [...new Set(reports.map((r) => r.analyst))].sort();

  return (
    <div className="border border-border rounded-xl bg-surface flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-xs font-mono text-muted tracking-widest uppercase">Report Library</h2>
        <button
          onClick={reindex}
          disabled={indexing}
          className="flex items-center gap-1.5 text-[10px] font-mono text-amber hover:bg-amber/10 px-2 py-1 rounded transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${indexing ? "animate-spin" : ""}`} />
          {indexing ? "Indexing…" : "Re-index"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 py-2 border-b border-border">
        <select
          value={analystFilter}
          onChange={(e) => { setAnalystFilter(e.target.value); onFilterChange(symbolFilter, e.target.value); }}
          className="flex-1 text-xs font-mono bg-background border border-border rounded px-2 py-1 text-primary focus:outline-none focus:border-amber/60"
        >
          <option value="">All Analysts</option>
          {analysts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value.toUpperCase()); onFilterChange(e.target.value.toUpperCase(), analystFilter); }}
          placeholder="SYMBOL"
          className="w-24 text-xs font-mono bg-background border border-border rounded px-2 py-1 text-primary placeholder-muted focus:outline-none focus:border-amber/60"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-4 text-xs font-mono text-muted animate-pulse">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-4 text-xs font-mono text-muted">
            No reports indexed. Click Re-index to scan PDFs.
          </div>
        ) : (
          reports.map((r) => (
            <a
              key={r.id}
              href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
            >
              <FileText className="w-3.5 h-3.5 text-muted group-hover:text-amber mt-0.5 shrink-0 transition-colors" />
              <div className="min-w-0">
                <div className="text-xs font-mono text-primary truncate">{r.company}</div>
                <div className="text-[10px] font-mono text-muted">
                  {r.analyst} · {r.date} · {r.reportType}
                  {r.rating && <> · <span className="text-amber">{r.rating}</span></>}
                  {r.targetPrice > 0 && <> · TP ₹{r.targetPrice.toLocaleString("en-IN")}</>}
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-border text-[10px] font-mono text-muted">
        {reports.length} reports
      </div>
    </div>
  );
}
