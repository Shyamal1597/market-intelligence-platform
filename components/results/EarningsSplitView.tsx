"use client";

import { useState, useEffect, useCallback } from "react";
import { EarningsListRow } from "./EarningsListRow";
import { EarningsChart } from "./EarningsChart";
import { WatchlistManager } from "./WatchlistManager";
import type { WatchlistEntry } from "@/lib/watchlist";
import type { EarningsData } from "@/lib/earnings";

type FilterKey = "sector" | "rating" | "marketCapBucket";
const ALL = "ALL";

// earningsMap: key present = fetched (null = no data, EarningsData = has data)
// fetchingSet: symbols currently in-flight
type EarningsMap = Record<string, EarningsData | null>;

export function EarningsSplitView() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [earningsMap, setEarningsMap] = useState<EarningsMap>({});
  const [fetchingSet, setFetchingSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    sector: ALL,
    rating: ALL,
    marketCapBucket: ALL,
  });

  // ── Load watchlist ────────────────────────────────────────────────────────

  const loadWatchlist = useCallback(async (selectFirst = false) => {
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as WatchlistEntry[];
      setWatchlist(data);
      setLoading(false);
      if (selectFirst) setSelected((prev) => prev ?? (data[0]?.symbol ?? null));
    } catch {
      setError("Failed to load watchlist");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist(true);
  }, [loadWatchlist]);

  // ── Fetch earnings lazily for each watchlist symbol ───────────────────────

  useEffect(() => {
    for (const e of watchlist) {
      const sym = e.symbol;
      if (sym in earningsMap || fetchingSet.has(sym)) continue;
      setFetchingSet((prev) => new Set(prev).add(sym));
      fetch(`/api/earnings/${sym}`)
        .then((r) => (r.ok ? (r.json() as Promise<EarningsData>) : Promise.resolve(null)))
        .then((data) => {
          setEarningsMap((prev) => ({ ...prev, [sym]: data }));
          setFetchingSet((prev) => { const s = new Set(prev); s.delete(sym); return s; });
        })
        .catch(() => {
          setEarningsMap((prev) => ({ ...prev, [sym]: null }));
          setFetchingSet((prev) => { const s = new Set(prev); s.delete(sym); return s; });
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleAdd(symbol: string) {
    setAdding(true);
    setError(null);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (res.ok) {
      await loadWatchlist();
    } else {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to add");
    }
    setAdding(false);
  }

  async function handleRemove(symbol: string) {
    await fetch(`/api/watchlist/${symbol}`, { method: "DELETE" });
    setWatchlist((prev) => {
      const next = prev.filter((e) => e.symbol !== symbol);
      if (selected === symbol) {
        setSelected(next[0]?.symbol ?? null);
      }
      return next;
    });
    setEarningsMap((prev) => { const n = { ...prev }; delete n[symbol]; return n; });
  }

  async function handleReset() {
    setLoading(true);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (res.ok) {
      setEarningsMap({});
      setFetchingSet(new Set());
      setSelected(null);
      await loadWatchlist(true);
    }
    setLoading(false);
  }

  async function handleRefresh(symbol: string) {
    setEarningsMap((prev) => { const n = { ...prev }; delete n[symbol]; return n; });
    setFetchingSet((prev) => new Set(prev).add(symbol));
    const res = await fetch(`/api/earnings/${symbol}?refresh=1`);
    const data: EarningsData | null = res.ok ? await res.json() : null;
    setEarningsMap((prev) => ({ ...prev, [symbol]: data }));
    setFetchingSet((prev) => { const s = new Set(prev); s.delete(symbol); return s; });
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  function uniqueVals(key: FilterKey): string[] {
    return [ALL, ...new Set(watchlist.map((e) => e[key]).filter((v): v is string => !!v))];
  }

  const filtered = watchlist.filter((e) => {
    if (filters.sector !== ALL && e.sector !== filters.sector) return false;
    if (filters.rating !== ALL && e.rating !== filters.rating) return false;
    if (filters.marketCapBucket !== ALL && e.marketCapBucket !== filters.marketCapBucket) return false;
    return true;
  });

  const selectedEntry = watchlist.find((e) => e.symbol === selected) ?? null;
  const isSelectedFetching = selected !== null && fetchingSet.has(selected);
  const selectedEarnings = selected !== null ? (earningsMap[selected] ?? null) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="animate-pulse h-12 bg-surface rounded-lg border border-border" />
        <div className="flex gap-4 h-[calc(100vh-16rem)]">
          <div className="w-64 animate-pulse bg-surface rounded-xl border border-border" />
          <div className="flex-1 animate-pulse bg-surface rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="px-4 py-2 rounded border border-danger/30 bg-danger/5 text-danger text-xs font-mono">
          {error}
        </div>
      )}

      <WatchlistManager
        watchlist={watchlist}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onReset={handleReset}
        adding={adding}
      />

      {/* Filter bar */}
      <div className="flex gap-4 items-center">
        {(["sector", "rating", "marketCapBucket"] as FilterKey[]).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted tracking-wider uppercase">
              {key === "marketCapBucket" ? "Cap" : key}
            </span>
            <select
              value={filters[key]}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              className="bg-surface border border-border rounded px-2 py-1 text-xs font-mono text-primary focus:outline-none focus:border-amber/60 transition-colors"
            >
              {uniqueVals(key).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <span className="text-[10px] font-mono text-muted ml-auto">{filtered.length} stocks</span>
      </div>

      {/* Split view */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 17rem)" }}>
        {/* Left: list */}
        <div className="w-64 shrink-0 border border-border rounded-xl bg-surface overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-muted text-xs font-mono p-4 text-center">No stocks match filter</p>
          ) : (
            filtered.map((entry) => {
              const sym = entry.symbol;
              // Pass undefined if still fetching, null if done with no data, EarningsData if done
              const earningsVal: EarningsData | null | undefined = fetchingSet.has(sym)
                ? undefined
                : earningsMap[sym] ?? null;
              return (
                <EarningsListRow
                  key={sym}
                  entry={entry}
                  earnings={earningsVal}
                  selected={selected === sym}
                  onClick={() => setSelected(sym)}
                />
              );
            })
          )}
        </div>

        {/* Right: chart */}
        <div className="flex-1 border border-border rounded-xl bg-surface p-5">
          {selectedEntry && !isSelectedFetching && selectedEarnings ? (
            <EarningsChart
              stock={selectedEntry}
              earnings={selectedEarnings}
              onRefresh={() => handleRefresh(selectedEntry.symbol)}
            />
          ) : selectedEntry && isSelectedFetching ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted font-mono text-sm animate-pulse">Loading {selectedEntry.symbol}&hellip;</p>
            </div>
          ) : selectedEntry ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted font-mono text-sm">No earnings data for {selectedEntry.symbol}</p>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted font-mono text-sm">Select a stock to view earnings</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
