"use client";

import { useState } from "react";
import type { ReportMeta } from "@/lib/reportTypes";
import { encodePdfPath } from "@/lib/reportTypes";
import { FileText, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

type SortKey = "company" | "analyst" | "date" | "rating" | "cmp" | "targetPrice" | "sinceIssue" | "upside";

export function CoverageTable({ reports, livePrices }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // (currentPrice - cmpAtIssue) / cmpAtIssue × 100
  function sinceIssue(r: ReportMeta): number | null {
    const live = r.symbol ? livePrices[r.symbol] : null;
    if (!live || !r.cmp || r.cmp <= 0) return null;
    return ((live - r.cmp) / r.cmp) * 100;
  }

  // (targetPrice - currentPrice) / currentPrice × 100
  function remainingUpside(r: ReportMeta): number | null {
    const live = r.symbol ? livePrices[r.symbol] : null;
    if (!live || !r.targetPrice || r.targetPrice <= 0) return null;
    return ((r.targetPrice - live) / live) * 100;
  }

  const sorted = [...reports].sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    if (sortKey === "sinceIssue") {
      av = sinceIssue(a) ?? -Infinity;
      bv = sinceIssue(b) ?? -Infinity;
    } else if (sortKey === "upside") {
      av = remainingUpside(a) ?? -Infinity;
      bv = remainingUpside(b) ?? -Infinity;
    } else if (sortKey === "date" || sortKey === "company" || sortKey === "analyst" || sortKey === "rating") {
      av = a[sortKey];
      bv = b[sortKey];
    } else {
      av = a[sortKey] ?? 0;
      bv = b[sortKey] ?? 0;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function ColHeader({ label, k, title }: { label: string; k: SortKey; title?: string }) {
    const active = sortKey === k;
    return (
      <th
        className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase cursor-pointer hover:text-primary select-none"
        onClick={() => toggleSort(k)}
        title={title}
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          ) : null}
        </span>
      </th>
    );
  }

  function PctCell({ value }: { value: number | null }) {
    if (value === null) return <span className="text-muted">—</span>;
    const color = value > 0 ? "text-teal" : value < 0 ? "text-danger" : "text-primary";
    return (
      <span className={`font-bold ${color}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </span>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-4">
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
          {reports.length} reports
        </span>
        <span className="text-[9px] font-mono text-muted/60">
          Since Issue = (current − CMP at report) / CMP at report · Vs Target = (target − current) / current
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border bg-background/50">
            <tr>
              <ColHeader label="Company" k="company" />
              <ColHeader label="Analyst" k="analyst" />
              <ColHeader label="Date" k="date" />
              <ColHeader label="Rating" k="rating" />
              <ColHeader label="CMP at Issue" k="cmp" title="Price at time of report" />
              <ColHeader label="Target ₹" k="targetPrice" />
              <th className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase">
                Prev Close
              </th>
              <ColHeader label="Since Issue" k="sinceIssue" title="(current − CMP at issue) / CMP at issue" />
              <ColHeader label="Vs Target" k="upside" title="(target − current) / current — remaining upside" />
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => {
              const live = r.symbol ? livePrices[r.symbol] : null;
              const since = sinceIssue(r);
              const upside = remainingUpside(r);
              return (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2 text-xs font-mono text-primary">{r.company}</td>
                  <td className="px-3 py-2 text-xs font-mono text-muted">{r.analyst}</td>
                  <td className="px-3 py-2 text-xs font-mono text-muted whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 text-xs font-mono text-amber">{r.rating || "—"}</td>
                  <td className="px-3 py-2 text-xs font-mono text-primary">
                    {r.cmp > 0 ? `\u20B9${r.cmp.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-primary">
                    {r.targetPrice > 0 ? `\u20B9${r.targetPrice.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-primary">
                    {live ? `\u20B9${live.toLocaleString("en-IN")}` : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    <PctCell value={since} />
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    <PctCell value={upside} />
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-amber transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
