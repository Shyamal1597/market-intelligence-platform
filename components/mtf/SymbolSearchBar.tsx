"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fmtCr } from "@/lib/mtf/format";
import { matchesSymbolSearch } from "@/lib/mtf/symbolSearch";

interface Row {
  symbol: string;
  name: string | null;
  amtToday: number | null;
  amtChangePct: number | null;
}

const MAX_RESULTS = 8;

/**
 * Header search bar covering the FULL symbol universe (matches "Symbols
 * w/ Data"), not just the isTradeable subset surfaced in movers/heatmap/
 * sector panels -- so a symbol excluded from those (immaterial book, NAV-
 * pegged) can still be found and drilled into directly. The full list is
 * fetched once, lazily, on first focus rather than on page load.
 */
export function SymbolSearchBar({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function ensureLoaded() {
    if (rows !== null || loading) return;
    setLoading(true);
    fetch("/api/mtf/symbols")
      .then((r) => r.json())
      .then((d) => { setRows(d.rows); setLoading(false); })
      .catch(() => { setRows([]); setLoading(false); });
  }

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toUpperCase();
  const matches = q && rows ? rows.filter((r) => matchesSymbolSearch(r, q)).slice(0, MAX_RESULTS) : [];

  function select(symbol: string) {
    onSelectSymbol(symbol);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-64">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="text"
        value={query}
        onFocus={() => { ensureLoaded(); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Search any symbol…"
        className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-base/40 border border-border text-[11px] font-mono text-primary placeholder:text-muted/60 focus:outline-none focus:border-amber/40"
      />
      {query && (
        <button
          onClick={() => { setQuery(""); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
        >
          <X size={12} />
        </button>
      )}

      {open && q && (
        <div className="absolute left-0 right-0 mt-1 z-40 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl shadow-black/50">
          {loading ? (
            <div className="px-3 py-3 text-[11px] font-mono text-muted animate-pulse">Loading symbols…</div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-3 text-[11px] font-mono text-muted">No symbols match &ldquo;{query}&rdquo;.</div>
          ) : (
            matches.map((r) => (
              <button
                key={r.symbol}
                onClick={() => select(r.symbol)}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-white/[0.04] transition-colors border-b border-border/40 last:border-b-0"
              >
                <span className="flex flex-col min-w-0">
                  <span className="font-mono text-[11px] text-primary">{r.symbol}</span>
                  {r.name && <span className="font-mono text-[9px] text-muted truncate">{r.name}</span>}
                </span>
                <span className="flex flex-col items-end shrink-0">
                  <span className="font-mono text-[10px] text-muted tabular-nums">{fmtCr(r.amtToday)}</span>
                  {r.amtChangePct !== null && (
                    <span className={`font-mono text-[9px] tabular-nums ${r.amtChangePct >= 0 ? "text-teal" : "text-danger"}`}>
                      {r.amtChangePct >= 0 ? "+" : ""}{r.amtChangePct.toFixed(1)}%
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
