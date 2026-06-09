"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { ReportMeta } from "@/lib/reportTypes";
import { encodePdfPath } from "@/lib/reportTypes";
import Link from "next/link";

interface Props {
  symbol: string;
}

export function CompanyReportsPanel({ symbol }: Props) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports/metadata?symbol=${symbol}`)
      .then((r) => r.json())
      .then((data: ReportMeta[]) => {
        setReports(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-border rounded-xl" />;

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono text-muted tracking-widest uppercase">Research Reports</h3>
        <Link
          href={`/reports?symbol=${symbol}`}
          className="flex items-center gap-1 text-[10px] font-mono text-amber hover:bg-amber/10 px-2 py-1 rounded transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Ask RAG
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted text-xs font-mono">
          No indexed reports for {symbol}. Set the symbol via Coverage Details and re-index.
        </p>
      ) : (
        <div className="space-y-1.5">
          {reports.map((r) => (
            <a
              key={r.id}
              href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-mono text-primary hover:text-amber transition-colors group"
            >
              <FileText className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0" />
              <span className="flex-1 truncate">
                {r.company} -- {r.reportType}
              </span>
              <span className="text-[10px] text-muted">{r.date}</span>
              {r.rating && <span className="text-[10px] text-amber">{r.rating}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
