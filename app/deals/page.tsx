"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, Layers, TrendingDown } from "lucide-react";
import type { Deal } from "@/lib/nse-deals";

type TabId = "block" | "bulk" | "short";

const TABS: { id: TabId; label: string }[] = [
  { id: "block", label: "Block Deals" },
  { id: "bulk", label: "Bulk Deals" },
  { id: "short", label: "Short Selling" },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtQty(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k`;
  return n.toLocaleString("en-IN");
}

function fmtValue(cr: number): string {
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(1)}k Cr`;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  return `₹${(cr * 100).toFixed(1)} L`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-border/40">
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-border/40 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── Deal Row ──────────────────────────────────────────────────────────────────

function DealRow({ deal }: { deal: Deal }) {
  const isBuy = deal.side === "BUY";
  const isSell = deal.side === "SELL";

  return (
    <tr className="border-b border-border/40 last:border-0 text-[11px] font-mono hover:bg-white/[0.02] transition-colors group">
      <td className="px-4 py-2.5 text-muted whitespace-nowrap">
        {deal.date || <span className="text-muted/40">—</span>}
      </td>
      <td className="px-4 py-2.5">
        <div className="text-primary font-semibold group-hover:text-amber transition-colors">
          {deal.symbol}
        </div>
        <div className="text-muted text-[10px] truncate max-w-[160px]">
          {deal.companyName}
        </div>
      </td>
      <td className="px-4 py-2.5 text-muted truncate max-w-[180px]">
        {deal.client || <span className="text-muted/40">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {deal.side === "UNKNOWN" ? (
          <span className="text-muted/40">—</span>
        ) : (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              isBuy
                ? "bg-teal/10 text-teal border border-teal/20"
                : isSell
                ? "bg-danger/10 text-danger border border-danger/20"
                : "text-muted"
            }`}
          >
            {deal.side}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right text-primary tabular-nums">
        {fmtQty(deal.quantity)}
      </td>
      <td className="px-4 py-2.5 text-right text-primary tabular-nums">
        {deal.price > 0
          ? `₹${deal.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
          : <span className="text-muted/40">—</span>
        }
      </td>
      <td className="px-4 py-2.5 text-right font-semibold text-amber tabular-nums">
        {deal.valueCr > 0 ? fmtValue(deal.valueCr) : <span className="text-muted/40">—</span>}
      </td>
    </tr>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabId }) {
  const msgs: Record<TabId, string> = {
    bulk: "No bulk deals found.",
    block: "No block deals for this date. Block deals only execute in the 8:45–9:00 AM and 2:05–2:20 PM windows.",
    short: "No short selling data available.",
  };
  return (
    <tr>
      <td colSpan={7} className="px-4 py-12 text-center text-xs font-mono text-muted">
        {msgs[tab]}
      </td>
    </tr>
  );
}

// ── Table Header ──────────────────────────────────────────────────────────────

function TableHead() {
  return (
    <tr className="border-b border-border text-[10px] font-mono text-muted uppercase tracking-widest">
      <th className="px-4 py-3 text-left font-normal">Date</th>
      <th className="px-4 py-3 text-left font-normal">Symbol / Company</th>
      <th className="px-4 py-3 text-left font-normal">Client</th>
      <th className="px-4 py-3 text-left font-normal">Side</th>
      <th className="px-4 py-3 text-right font-normal">Quantity</th>
      <th className="px-4 py-3 text-right font-normal">Price</th>
      <th className="px-4 py-3 text-right font-normal">Value</th>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const today = new Date().toISOString().split("T")[0];

  const [tab, setTab] = useState<TabId>("bulk");
  const [date, setDate] = useState(today);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [asOnDate, setAsOnDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (activeTab: TabId, activeDate: string, isRefresh = false) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ tab: activeTab });
        if (activeTab === "block") params.set("date", activeDate);

        const res = await fetch(`/api/deals?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        setDeals(json.deals ?? []);
        setAsOnDate(json.asOnDate ?? "");
        setFetchedAt(json.fetchedAt ?? "");
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Failed to load data.");
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    load(tab, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, date]);

  const handleTabChange = (newTab: TabId) => {
    if (newTab === tab) return;
    setDeals([]);
    setAsOnDate("");
    setTab(newTab);
  };

  const buyCount = deals.filter((d) => d.side === "BUY").length;
  const sellCount = deals.filter((d) => d.side === "SELL").length;
  const totalValue = deals.reduce((s, d) => s + d.valueCr, 0);
  const skeletonCols = 7;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {tab === "short" ? (
              <TrendingDown className="w-5 h-5 text-danger" />
            ) : (
              <Layers className="w-5 h-5 text-amber" />
            )}
            <h1 className="font-display text-4xl font-semibold text-primary tracking-tight">
              {tab === "block" ? "Block Deals" : tab === "bulk" ? "Bulk Deals" : "Short Selling"}
            </h1>
          </div>
          <p className="text-muted text-xs font-mono">
            {asOnDate
              ? <>NSE snapshot · as of <span className="text-primary">{asOnDate}</span></>
              : "NSE institutional deal flow"
            }
            {fetchedAt && <> · fetched {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {tab === "block" && (
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs font-mono bg-surface border border-border rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:border-amber/50 cursor-pointer"
            />
          )}
          <button
            onClick={() => load(tab, date, true)}
            disabled={refreshing || loading}
            className="text-muted hover:text-primary transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-border pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-4 py-2.5 text-xs font-mono font-medium tracking-wide transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-amber text-amber"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      {!loading && deals.length > 0 && (
        <div className="flex items-center gap-6 mb-4 font-mono text-xs text-muted">
          {tab !== "short" && (
            <>
              <span><span className="text-teal font-semibold">{buyCount}</span> buy</span>
              <span><span className="text-danger font-semibold">{sellCount}</span> sell</span>
            </>
          )}
          <span><span className="text-primary font-semibold">{deals.length}</span> records</span>
          {tab !== "short" && totalValue > 0 && (
            <span>Total <span className="text-amber font-semibold">{fmtValue(totalValue)}</span></span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4 text-danger text-xs font-mono">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><TableHead /></thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} cols={skeletonCols} />)
            ) : deals.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              deals.map((deal) => <DealRow key={deal.id} deal={deal} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
