"use client";

import { useState } from "react";
import type { ReportMeta } from "@/lib/reportIndexer";
import { encodePdfPath } from "@/lib/reportIndexer";
import { FileText, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

type SortKey = "company" | "analyst" | "date" | "rating" | "cmp" | "targetPrice" | "upside";

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

  function upside(r: ReportMeta): number | null {
    const live = r.symbol ? livePrices[r.symbol] : null;
    if (!live || !r.targetPrice) return null;
    return ((r.targetPrice - live) / live) * 100;
  }

  const sorted = [...reports].sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    if (sortKey === "upside") {
      av = upside(a) ?? -Infinity;
      bv = upside(b) ?? -Infinity;
    } else if (
      sortKey === "date" ||
      sortKey === "company" ||
      sortKey === "analyst" ||
      sortKey === "rating"
    ) {
      av = a[sortKey];
      bv = b[sortKey];
    } else {
      av = a[sortKey] ?? 0;
      bv = b[sortKey] ?? 0;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function ColHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase cursor-pointer hover:text-primary select-none"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )
          ) : null}
        </span>
      </th>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-border bg-background/50">
          <tr>
            <ColHeader label="Company" k="company" />
            <ColHeader label="Analyst" k="analyst" />
            <ColHeader label="Date" k="date" />
            <ColHeader label="Rating" k="rating" />
            <ColHeader label="CMP at Issue" k="cmp" />
            <ColHeader label="Target ₹" k="targetPrice" />
            <th className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase">
              Live CMP
            </th>
            <ColHeader label="Upside" k="upside" />
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((r) => {
            const live = r.symbol ? livePrices[r.symbol] : null;
            const up = upside(r);
            return (
              <tr key={r.id} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-2 text-xs font-mono text-primary">{r.company}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted">{r.analyst}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted">{r.date}</td>
                <td className="px-3 py-2 text-xs font-mono text-amber">{r.rating || "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {r.cmp > 0 ? `₹${r.cmp.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {r.targetPrice > 0 ? `₹${r.targetPrice.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {live ? (
                    `₹${live.toLocaleString("en-IN")}`
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs font-mono font-bold">
                  {up !== null ? (
                    <span className={up >= 0 ? "text-teal" : "text-danger"}>
                      {up >= 0 ? "+" : ""}
                      {up.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
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
  );
}
