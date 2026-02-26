"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { FilingCategory } from "@/lib/bse-filings";

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
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function FilingCard({ filing }: { filing: Filing }) {
  return (
    <div className="p-3 rounded-lg border border-[#1E2235] bg-base/60 hover:bg-[#1E2235]/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-display text-sm font-semibold text-primary leading-tight line-clamp-1">
          {filing.company}
        </span>
        <Badge label={filing.filingType} variant={filing.category} />
      </div>
      <p className="text-xs text-muted leading-snug line-clamp-2">{filing.description}</p>
      <p className="text-xs font-mono text-muted/50 mt-1">{timeAgo(filing.submittedAt)}</p>
    </div>
  );
}

export function DashboardFilings() {
  const [filings, setFilings] = useState<Filing[]>([]);

  const load = () => {
    fetch("/api/filings?limit=6")
      .then((r) => r.json())
      .then((d) => setFilings(d.filings ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  if (filings.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse h-16 bg-[#1E2235] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filings.slice(0, 6).map((f) =>
        f.pdfUrl ? (
          <a key={f.id} href={f.pdfUrl} target="_blank" rel="noopener noreferrer">
            <FilingCard filing={f} />
          </a>
        ) : (
          <div key={f.id}>
            <FilingCard filing={f} />
          </div>
        )
      )}
    </div>
  );
}
