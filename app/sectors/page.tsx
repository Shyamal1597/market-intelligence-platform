"use client";

import { useEffect, useState } from "react";
import { BreadthBar } from "@/components/sectors/BreadthBar";
import { SectorTile } from "@/components/sectors/SectorTile";
import { SectorLeaderboard } from "@/components/sectors/SectorLeaderboard";
import { BseSectorGrid } from "@/components/sectors/BseSectorGrid";
import type { QuoteData } from "@/lib/yahoo-finance";
import type { BseSectorQuote } from "@/lib/bse-sectors";

export default function SectorsPage() {
  // ── Nifty sectors (Yahoo Finance) ─────────────────────────────────────────
  const [niftyQuotes, setNiftyQuotes] = useState<QuoteData[]>([]);
  const [niftyLoading, setNiftyLoading] = useState(true);

  // ── BSE SENSEX sectors ────────────────────────────────────────────────────
  const [bseSectors, setBseSectors] = useState<BseSectorQuote[]>([]);
  const [bseLoading, setBseLoading] = useState(true);
  const [bseFetchedAt, setBseFetchedAt] = useState("");

  // Active tab
  const [tab, setTab] = useState<"nifty" | "bse">("bse");

  useEffect(() => {
    let ctrl: AbortController | null = null;

    const fetchNifty = () => {
      ctrl?.abort();
      ctrl = new AbortController();
      fetch("/api/sectors", { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { quotes?: QuoteData[] }) => {
          setNiftyQuotes(d.quotes ?? []);
          setNiftyLoading(false);
        })
        .catch(() => setNiftyLoading(false));
    };

    const fetchBse = () => {
      fetch("/api/bse-sectors")
        .then((r) => r.json())
        .then((d: { sectors?: BseSectorQuote[]; fetchedAt?: string }) => {
          setBseSectors(d.sectors ?? []);
          if (d.fetchedAt) setBseFetchedAt(d.fetchedAt);
          setBseLoading(false);
        })
        .catch(() => setBseLoading(false));
    };

    fetchNifty();
    fetchBse();

    const id = setInterval(() => { fetchNifty(); fetchBse(); }, 60_000);
    return () => { clearInterval(id); ctrl?.abort(); };
  }, []);

  const niftyAdvancing = niftyQuotes.filter((q) => q.changePercent > 0).length;
  const niftyDeclining = niftyQuotes.filter((q) => q.changePercent < 0).length;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
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
          BSE SENSEX sectors · Nifty sector indices · auto-polls every minute
          {bseFetchedAt && tab === "bse" && (
            <> · last updated {new Date(bseFetchedAt).toLocaleTimeString("en-IN")}</>
          )}
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 bg-surface border border-border rounded-lg p-1 w-fit">
        {(["bse", "nifty"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-mono transition-colors ${
              tab === t
                ? "bg-amber text-black font-semibold"
                : "text-muted hover:text-primary"
            }`}
          >
            {t === "bse" ? "BSE SENSEX" : "Nifty"}
          </button>
        ))}
      </div>

      {/* ── BSE SENSEX tab ──────────────────────────────────────────────────── */}
      {tab === "bse" && (
        <BseSectorGrid sectors={bseSectors} loading={bseLoading} />
      )}

      {/* ── Nifty tab ───────────────────────────────────────────────────────── */}
      {tab === "nifty" && (
        <>
          {niftyLoading ? (
            <>
              <div className="animate-pulse h-2 w-full rounded-full bg-surface mb-6" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="h-[140px] animate-pulse bg-surface rounded-xl border border-border" />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <BreadthBar advancing={niftyAdvancing} declining={niftyDeclining} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                {niftyQuotes.map((q) => (
                  <SectorTile key={q.symbol} quote={q} />
                ))}
              </div>
              {niftyQuotes.length > 0 && (
                <div className="border border-border rounded-xl px-5 py-4 bg-surface">
                  <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-3">
                    Today&apos;s Ranking
                  </p>
                  <SectorLeaderboard quotes={niftyQuotes} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
