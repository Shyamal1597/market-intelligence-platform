"use client";

import { useEffect, useState } from "react";
import { BreadthBar } from "@/components/sectors/BreadthBar";
import { SectorTile } from "@/components/sectors/SectorTile";
import { SectorLeaderboard } from "@/components/sectors/SectorLeaderboard";
import type { QuoteData } from "@/lib/yahoo-finance";

export default function SectorsPage() {
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let currentController: AbortController | null = null;

    const fetchData = () => {
      currentController?.abort(); // cancel any in-flight request from previous tick
      currentController = new AbortController();
      fetch("/api/sectors", { signal: currentController.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`API error ${r.status}`);
          return r.json();
        })
        .then((data: { quotes?: QuoteData[] }) => {
          setQuotes(data.quotes ?? []);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") {
            setError("Could not load sector data.");
            setLoading(false);
          }
        });
    };

    fetchData();
    const intervalId = setInterval(fetchData, 60000);
    return () => {
      clearInterval(intervalId);
      currentController?.abort();
    };
  }, []);

  const advancing = quotes.filter((q) => q.changePercent > 0).length;
  const declining = quotes.filter((q) => q.changePercent < 0).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Sector Dashboard
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-teal border border-teal/30 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-muted text-sm font-sans">
          Nifty sector indices · auto-polls every minute
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {loading ? (
        <>
          {/* Breadth bar skeleton */}
          <div className="animate-pulse h-2 w-full rounded-full bg-surface-raised mb-6" />
          {/* Grid skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-[140px] bg-surface rounded-xl border border-[#1E2235]"
              />
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Row 1: BreadthBar */}
          <div className="mb-6">
            <BreadthBar advancing={advancing} declining={declining} />
          </div>

          {/* Row 2: Sector heatmap grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {quotes.map((q) => (
              <SectorTile key={q.symbol} quote={q} />
            ))}
          </div>

          {/* Row 3: Leaderboard */}
          {quotes.length > 0 && (
            <div className="border border-[#1E2235] rounded-xl px-5 py-4 bg-surface">
              <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-3">
                Today&apos;s Ranking
              </p>
              <SectorLeaderboard quotes={quotes} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
