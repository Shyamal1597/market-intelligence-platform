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
    fetch("/api/filings?limit=6")
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
    <div className="glass-panel p-5 rounded-2xl flex flex-col h-full relative overflow-hidden transition-all duration-500 hover:shadow-lg hover:shadow-amber-500/5 hover:border-white/10">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <span className="font-display font-semibold tracking-wide text-amber text-sm uppercase">
          NSE Filings
        </span>
        {/* Live pulse dot */}
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse shadow-[0_0_8px_rgba(255,93,0,1)]" />
          LIVE
        </span>
        <div className="flex-1 h-px bg-border-strong" />
        {!loading && (
          <span className="font-mono text-[10px] text-muted">
            {filings.length}
          </span>
        )}
        <a
          href="/filings"
          className="font-mono text-[10px] text-amber hover:underline ml-1 hover:text-glow transition-all"
        >
          All →
        </a>
      </div>

      {/* Updated label */}
      {updatedLabel && (
        <p className="font-mono text-[9px] text-muted/50 mb-3 text-right relative z-10">
          {updatedLabel}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="divide-y divide-border relative z-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-3 bg-border rounded w-16 mb-2" />
              <div className="h-4 bg-border-strong rounded w-full mb-1" />
              <div className="h-3 bg-border rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filings.length === 0 && (
        <p className="text-muted text-sm font-sans py-4 relative z-10">
          No filings available.
        </p>
      )}

      {/* Filing rows */}
      {!loading && filings.length > 0 && (
        <div className="space-y-3 relative z-10 w-full pb-2">
          {filings.slice(0, 6).map((f) => {
            const row = (
              <div className="p-4 rounded-xl border border-border bg-surface-raised hover:bg-white/[0.04] hover:border-amber/30 hover:shadow-md hover:shadow-amber/5 transition-all duration-300 transform hover:-translate-y-0.5 group">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge label={f.filingType} variant={f.category} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted whitespace-nowrap bg-surface px-1.5 py-0.5 rounded">
                      {timeAgo(f.submittedAt)}
                    </span>
                    {f.pdfUrl && (
                      <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0 ml-1" />
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-primary font-sans leading-snug line-clamp-1 group-hover:text-amber transition-colors">
                  {f.company}
                </p>
                <p className="text-xs text-muted line-clamp-2 mt-1 font-sans leading-relaxed">
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
                className="block"
              >
                {row}
              </a>
            ) : (
              <div key={f.id} className="block">{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
