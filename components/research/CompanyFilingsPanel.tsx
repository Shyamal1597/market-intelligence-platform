"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

interface NSEFiling {
  id: string;
  company: string;
  scripCode: string;
  filingType: string;
  category: string;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}

interface Props {
  symbol: string; // NSE trading symbol e.g. "RELIANCE"
}

const CATEGORY_COLORS: Record<string, string> = {
  results: "text-amber",
  "board-meeting": "text-teal",
  "insider-trade": "text-danger",
  "ipo-drhp": "text-[#3B82F6]",
  general: "text-muted",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "text-muted";
}

export function CompanyFilingsPanel({ symbol }: Props) {
  const [filings, setFilings] = useState<NSEFiling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) {
      setLoading(false);
      return;
    }
    fetch(`/api/filings?symbol=${encodeURIComponent(symbol)}&limit=10`)
      .then((r) => (r.ok ? r.json() : { filings: [] }))
      .then((data: { filings?: NSEFiling[] }) => {
        setFilings(data.filings ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading)
    return <div className="animate-pulse h-32 bg-border rounded-xl" />;

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <h3 className="text-xs font-mono text-muted tracking-widest mb-3 uppercase">
        Recent Filings
      </h3>
      {filings.length === 0 ? (
        <p className="text-muted text-xs font-mono">No filings found.</p>
      ) : (
        <div className="space-y-2">
          {filings.map((f) => (
            <a
              key={f.id}
              href={f.pdfUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 hover:bg-white/[0.03] rounded p-1 -mx-1 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-sans text-primary line-clamp-2 group-hover:text-amber transition-colors">
                  {f.description || f.filingType}
                </p>
                <p className="text-[10px] font-mono mt-0.5 flex gap-2">
                  <span className={categoryColor(f.category)}>{f.filingType}</span>
                  <span className="text-muted">
                    {new Date(f.submittedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </p>
              </div>
              {f.pdfUrl && (
                <ExternalLink className="w-3 h-3 text-muted shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
