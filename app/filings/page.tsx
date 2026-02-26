"use client";

import { useEffect, useState, useRef } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { FilingCategory } from "@/lib/nse-filings";

interface Filing {
  id: string;
  company: string;
  scripCode: string;
  category: FilingCategory;
  filingType: string;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "results", label: "Results" },
  { key: "board-meeting", label: "Board Meeting" },
  { key: "insider-trade", label: "Insider / Promoter" },
  { key: "ipo-drhp", label: "IPO / DRHP" },
  { key: "general", label: "General" },
] as const;

export default function FilingsPage() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set());

  const load = async () => {
    try {
      const res = await fetch("/api/filings?limit=60");
      const data = await res.json();
      const incoming: Filing[] = data.filings ?? [];

      // Detect genuinely new entries for flash animation
      const incomingIds = new Set(incoming.map((f) => f.id));
      const freshIds = new Set([...incomingIds].filter((id) => !prevIds.current.has(id)));
      if (freshIds.size > 0 && prevIds.current.size > 0) {
        setNewIds(freshIds);
      }
      prevIds.current = incomingIds;
      setFilings(incoming);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 120000); // poll every 2 min
    return () => clearInterval(i);
  }, []);

  // Clear flash after animation
  useEffect(() => {
    if (newIds.size === 0) return;
    const t = setTimeout(() => setNewIds(new Set()), 1000);
    return () => clearTimeout(t);
  }, [newIds]);

  const visible =
    filter === "all" ? filings : filings.filter((f) => f.category === filter);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            NSE Filings
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-danger border border-danger/30 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-muted text-sm font-sans">
          Corporate announcements from NSE India · auto-polls every 2 min
        </p>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`px-3 py-1.5 rounded text-xs font-mono tracking-wide border transition-all ${
              filter === c.key
                ? "bg-amber/10 text-amber border-amber/40"
                : "bg-surface text-muted border-[#1E2235] hover:text-primary hover:border-[#2A2D42]"
            }`}
          >
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Filings list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse h-24 bg-surface rounded-xl border border-[#1E2235]"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((f) => {
            const isNew = newIds.has(f.id);
            return (
              <div
                key={f.id}
                className={`group border border-[#1E2235] rounded-xl p-5 bg-surface hover:bg-surface/60 transition-all ${
                  isNew ? "animate-flash" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="font-display text-xl font-semibold text-primary group-hover:text-amber transition-colors">
                        {f.company}
                      </h3>
                      {f.scripCode && (
                        <span className="text-xs font-mono text-muted border border-[#1E2235] px-1.5 py-0.5 rounded">
                          {f.scripCode}
                        </span>
                      )}
                      <Badge label={f.filingType} variant={f.category} />
                    </div>
                    <p className="text-sm text-muted leading-relaxed">{f.description}</p>
                    <p className="text-xs font-mono text-muted/50 mt-2">
                      {timeAgo(f.submittedAt)}
                    </p>
                  </div>
                  {f.pdfUrl && (
                    <a
                      href={f.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1E2235] text-xs font-mono text-muted hover:text-amber hover:border-amber/40 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      PDF
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="text-center py-20 text-muted">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-display text-2xl">No filings in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
