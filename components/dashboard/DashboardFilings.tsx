"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { FilingCategory } from "@/lib/nse-filings";

interface Filing {
  id: string;
  company: string;
  category: FilingCategory;
  filingType: string;
  description: string;
  submittedAt: string;
  pdfUrl: string | null;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function DashboardFilings() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    fetch("/api/filings?limit=8")
      .then((r) => r.json())
      .then((d) => {
        if (!mountedRef.current) return;
        setFilings(d.filings ?? []);
        setLastUpdated(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(load, 120_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  const updatedLabel = lastUpdated
    ? `Updated ${timeAgo(lastUpdated.toISOString())} ago`
    : null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] tracking-widest text-amber/70 uppercase">
          NSE Filings
        </span>
        {/* Live pulse dot — teal = real-time data stream, not an error state */}
        <span className="flex items-center gap-1 font-mono text-[10px] text-teal/80">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          LIVE
        </span>
        <div className="flex-1 h-px bg-[#1E2235]" />
        {!loading && (
          <span className="font-mono text-[10px] text-muted">
            {filings.length}
          </span>
        )}
        <a
          href="/filings"
          className="font-mono text-[10px] text-amber hover:underline ml-1"
        >
          All →
        </a>
      </div>

      {/* Updated label */}
      {updatedLabel && (
        <p className="font-mono text-[9px] text-muted/50 mb-2 text-right">
          {updatedLabel}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="divide-y divide-[#1E2235]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-3 bg-[#1E2235] rounded w-16 mb-2" />
              <div className="h-4 bg-[#1E2235] rounded w-full mb-1" />
              <div className="h-3 bg-[#1E2235] rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filings.length === 0 && (
        <p className="text-muted text-sm font-mono py-4">
          No filings available.
        </p>
      )}

      {/* Filing rows */}
      {!loading && filings.length > 0 && (
        <div className="divide-y divide-[#1E2235]">
          {filings.slice(0, 8).map((f) => {
            const row = (
              <div className="py-3 group">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge label={f.filingType} variant={f.category} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted">
                      {timeAgo(f.submittedAt)}
                    </span>
                    {f.pdfUrl && (
                      <ExternalLink className="w-3 h-3 text-muted group-hover:text-amber transition-colors shrink-0" />
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-primary font-sans leading-tight truncate group-hover:text-amber transition-colors">
                  {f.company}
                </p>
                <p className="text-xs text-muted truncate mt-0.5 font-sans">
                  {f.description}
                </p>
              </div>
            );

            return f.pdfUrl ? (
              <a
                key={f.id}
                href={f.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-white/[0.02] transition-colors -mx-4 px-4"
              >
                {row}
              </a>
            ) : (
              <div key={f.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
