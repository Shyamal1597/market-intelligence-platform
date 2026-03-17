// app/deals/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Layers } from "lucide-react";
import type { Deal } from "@/lib/nse-deals";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-IN");
}

function fmtValue(cr: number): string {
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(1)}k Cr`;
  if (cr >= 1) return `₹${cr.toFixed(1)} Cr`;
  return `₹${(cr * 100).toFixed(1)} L`;
}

// ── Deal Row ──────────────────────────────────────────────────────────────────

function DealRow({ deal }: { deal: Deal }) {
  const isBuy = deal.side === "BUY";
  const isSell = deal.side === "SELL";

  return (
    <tr className="border-b border-[#1E2235]/60 last:border-0 text-[11px] font-mono hover:bg-white/[0.02] transition-colors group">
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
            deal.type === "BULK"
              ? "bg-amber/15 text-amber border border-amber/25"
              : "bg-blue-400/15 text-blue-400 border border-blue-400/25"
          }`}
        >
          {deal.type}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="text-primary font-semibold group-hover:text-amber transition-colors">
          {deal.symbol}
        </div>
        <div className="text-muted text-[10px] truncate max-w-[180px]">
          {deal.companyName}
        </div>
      </td>
      <td className="px-4 py-2.5 text-muted">{deal.exchange}</td>
      <td className="px-4 py-2.5">
        <span
          className={`font-semibold ${
            isBuy ? "text-teal" : isSell ? "text-danger" : "text-muted"
          }`}
        >
          {deal.side}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right text-primary tabular-nums">
        {fmtQty(deal.quantity)}
      </td>
      <td className="px-4 py-2.5 text-right text-primary tabular-nums">
        ₹{deal.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold text-amber tabular-nums">
        {fmtValue(deal.valueCr)}
      </td>
      <td className="px-4 py-2.5 text-muted max-w-[200px] truncate">
        {deal.client}
      </td>
    </tr>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#1E2235]/60">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-[#1E2235] rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (d: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/deals?date=${d}`);
      const json = await res.json();
      setDeals(json.deals ?? []);
      setFetchedAt(json.fetchedAt ?? "");
    } catch {
      setError("Failed to load deals data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };

  const bulkCount = deals.filter((d) => d.type === "BULK").length;
  const blockCount = deals.filter((d) => d.type === "BLOCK").length;
  const totalValue = deals.reduce((s, d) => s + d.valueCr, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Layers className="w-5 h-5 text-amber" />
            <h1 className="font-display text-4xl font-semibold text-primary tracking-tight">
              Bulk & Block Deals
            </h1>
          </div>
          <p className="text-muted text-xs font-mono">
            NSE institutional deal flow
            {fetchedAt && (
              <> · updated {new Date(fetchedAt).toLocaleTimeString("en-IN")}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date picker */}
          <input
            type="date"
            value={date}
            max={today}
            onChange={handleDateChange}
            className="text-xs font-mono bg-surface border border-border rounded-lg px-3 py-1.5 text-primary focus:outline-none focus:border-amber/50 cursor-pointer"
          />
          <button
            onClick={() => load(date, true)}
            disabled={refreshing || loading}
            className="text-muted hover:text-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && deals.length > 0 && (
        <div className="flex items-center gap-6 mb-5 font-mono text-xs text-muted">
          <span>
            <span className="text-amber font-semibold">{bulkCount}</span> bulk
          </span>
          <span>
            <span className="text-blue-400 font-semibold">{blockCount}</span> block
          </span>
          <span>
            Total value{" "}
            <span className="text-primary font-semibold">{fmtValue(totalValue)}</span>
          </span>
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
          <thead>
            <tr className="border-b border-[#1E2235] text-[10px] font-mono text-muted uppercase tracking-widest">
              <th className="px-4 py-3 text-left font-normal">Type</th>
              <th className="px-4 py-3 text-left font-normal">Company</th>
              <th className="px-4 py-3 text-left font-normal">Exchange</th>
              <th className="px-4 py-3 text-left font-normal">Side</th>
              <th className="px-4 py-3 text-right font-normal">Quantity</th>
              <th className="px-4 py-3 text-right font-normal">Price</th>
              <th className="px-4 py-3 text-right font-normal">Value</th>
              <th className="px-4 py-3 text-left font-normal">Client</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-xs font-mono">
                  {date !== new Date().toISOString().split("T")[0] ? (
                    <span className="text-muted">
                      NSE historical deal data requires a browser session — only today&apos;s live data is available.
                      <br />
                      <span className="text-amber/60">Switch back to today to see active deals.</span>
                    </span>
                  ) : (
                    <span className="text-muted">No bulk or block deals recorded today.</span>
                  )}
                </td>
              </tr>
            ) : (
              deals.map((deal) => <DealRow key={deal.id} deal={deal} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
