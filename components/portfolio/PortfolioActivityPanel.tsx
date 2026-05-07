"use client";

import { useEffect, useState } from "react";
import { Newspaper, FileText, Shuffle } from "lucide-react";
import { ActivityColumn } from "./ActivityColumn";
import type { ColumnTab } from "./ActivityColumn";

const FILING_TABS: ColumnTab[] = [
  { key: "all",                label: "All" },
  { key: "results",            label: "Results" },
  { key: "corporate-action",   label: "Corp. Action" },
  { key: "annual-report",      label: "Annual" },
  { key: "investor-complaint", label: "Complaints" },
  { key: "insider-trade",      label: "Insider" },
];

const FILING_TYPE_TO_TAB: Record<string, string> = {
  "Financial Results":  "results",
  "Corporate Action":   "corporate-action",
  "Annual Report":      "annual-report",
  "Investor Complaint": "investor-complaint",
  "Insider Trading":    "insider-trade",
};

const DEAL_TABS: ColumnTab[] = [
  { key: "all",   label: "All" },
  { key: "BULK",  label: "Bulk" },
  { key: "BLOCK", label: "Block" },
  { key: "SHORT", label: "Short" },
];

interface NewsItem { title: string; source: string; pubDate: string; link: string | null }
interface FilingItem { id: string; company: string; filingType: string; description: string; pdfUrl: string | null; submittedAt: string }
interface DealItem { id: string; type: string; date: string; symbol?: string; client: string; side: string; quantity: number; price: number | null; valueCr: number | null }
interface ActivityData {
  symbol: string | null;
  news: { items: NewsItem[]; fetchedAt: string };
  filings: { items: FilingItem[]; fetchedAt: string };
  deals: { bulk: DealItem[]; block: DealItem[]; short: DealItem[]; fetchedAt: string };
}
interface Quote { price: number; change: number; changePercent: number }

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return iso; }
}

function fmtCr(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toFixed(2) + " Cr";
}

export function PortfolioActivityPanel({ symbol, name }: { symbol: string | null; name: string | null }) {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [filingsTab, setFilingsTab] = useState("all");
  const [dealsTab, setDealsTab] = useState("all");

  useEffect(() => {
    setActivity(null); setQuote(null); setLoading(true);
    if (symbol) {
      Promise.all([
        fetch(`/api/portfolio/${symbol}/activity`).then((r) => r.json()),
        fetch(`/api/quote/${symbol}`).then((r) => (r.ok ? r.json() : null)),
      ]).then(([activityData, quoteData]) => {
        setActivity(activityData as ActivityData);
        setQuote(quoteData as Quote | null);
        setLoading(false);
      });
    } else {
      fetch("/api/portfolio/general/activity").then((r) => r.json()).then((data) => {
        setActivity(data as ActivityData); setLoading(false);
      });
    }
  }, [symbol]);

  const up = (quote?.changePercent ?? 0) >= 0;
  const isGeneral = !symbol;

  const allFilings = activity?.filings.items ?? [];
  const visibleFilings = filingsTab === "all" ? allFilings : allFilings.filter((f) => FILING_TYPE_TO_TAB[f.filingType] === filingsTab);

  const bulkDeals  = activity?.deals.bulk  ?? [];
  const blockDeals = activity?.deals.block ?? [];
  const shortDeals = activity?.deals.short ?? [];
  const visibleDeals =
    dealsTab === "BULK"  ? bulkDeals  :
    dealsTab === "BLOCK" ? blockDeals :
    dealsTab === "SHORT" ? shortDeals :
    [...bulkDeals, ...blockDeals, ...shortDeals];
  const totalDealsCount = bulkDeals.length + blockDeals.length + shortDeals.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center px-5 py-3 border-b border-border shrink-0 gap-4 bg-surface">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono font-semibold text-primary">
              {isGeneral ? "Market Overview" : name}
            </span>
            {quote && !isGeneral && (
              <>
                <span className="text-sm font-mono font-semibold text-primary">
                  ₹{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] font-mono font-semibold" style={{ color: up ? "var(--color-teal)" : "var(--color-danger)" }}>
                  {up ? "+" : ""}{quote.changePercent.toFixed(2)}%
                </span>
              </>
            )}
          </div>
          <span className="text-[10px] font-mono text-muted">
            {isGeneral ? "Live feed across all instruments" : `${symbol} · NSE`}
          </span>
        </div>
        {isGeneral && (
          <span
            className="ml-auto text-[9px] font-mono px-2 py-1 rounded shrink-0 text-amber"
            style={{ background: "color-mix(in srgb, var(--color-amber) 10%, transparent)" }}
          >
            ALL INSTRUMENTS
          </span>
        )}
      </div>

      {/* 3-column grid */}
      <div className="flex-1 grid grid-cols-3 min-h-0 overflow-hidden">
        {/* News */}
        <ActivityColumn
          title="Market News" icon={<Newspaper className="w-3.5 h-3.5" />}
          count={activity?.news.items.length ?? 0} loading={loading}
          empty={!loading && (activity?.news.items.length ?? 0) === 0}
        >
          {activity?.news.items.map((n, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-surface border border-border">
              {n.link ? (
                <a href={n.link} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-mono leading-relaxed hover:underline text-primary">
                  {n.title}
                </a>
              ) : (
                <p className="text-[11px] font-mono leading-relaxed text-primary">{n.title}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] font-mono text-amber">{n.source}</span>
                <span className="text-[9px] font-mono text-muted">{fmtDate(n.pubDate)}</span>
              </div>
            </div>
          ))}
        </ActivityColumn>

        {/* Filings */}
        <ActivityColumn
          title="NSE Filings" icon={<FileText className="w-3.5 h-3.5" />}
          count={visibleFilings.length} loading={loading}
          empty={!loading && visibleFilings.length === 0}
          tabs={FILING_TABS} activeTab={filingsTab} onTabChange={setFilingsTab}
        >
          {visibleFilings.map((f) => (
            <div key={f.id} className="p-2.5 rounded-lg bg-surface border border-border">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span
                  className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-amber"
                  style={{ background: "color-mix(in srgb, var(--color-amber) 10%, transparent)" }}
                >
                  {f.filingType}
                </span>
                <span className="text-[9px] font-mono shrink-0 text-muted">{fmtDate(f.submittedAt)}</span>
              </div>
              {isGeneral && f.company && (
                <p className="text-[9px] font-mono mb-0.5 text-amber">{f.company}</p>
              )}
              <p className="text-[11px] font-mono leading-relaxed text-primary">{f.description || f.filingType}</p>
              {f.pdfUrl && (
                <a href={f.pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] font-mono mt-1.5 inline-block hover:underline text-teal">
                  View filing →
                </a>
              )}
            </div>
          ))}
        </ActivityColumn>

        {/* Deals */}
        <ActivityColumn
          title="Bulk / Block / Short" icon={<Shuffle className="w-3.5 h-3.5" />}
          count={dealsTab === "all" ? totalDealsCount : visibleDeals.length} loading={loading}
          empty={!loading && visibleDeals.length === 0}
          tabs={DEAL_TABS} activeTab={dealsTab} onTabChange={setDealsTab}
        >
          {visibleDeals.map((d) => {
            const isShort = d.type === "SHORT";
            const hasSide = !isShort && d.side !== "UNKNOWN";
            return (
              <div key={d.id} className="p-2.5 rounded-lg bg-surface border border-border">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {hasSide ? (
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: d.side === "BUY" ? "color-mix(in srgb, var(--color-teal) 10%, transparent)" : "color-mix(in srgb, var(--color-danger) 10%, transparent)",
                          color: d.side === "BUY" ? "var(--color-teal)" : "var(--color-danger)",
                        }}
                      >
                        {d.side}
                      </span>
                    ) : (
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-amber"
                        style={{ background: "color-mix(in srgb, var(--color-amber) 10%, transparent)" }}
                      >
                        NET SHORT
                      </span>
                    )}
                    <span className="text-[9px] font-mono uppercase text-muted">{d.type}</span>
                    {isGeneral && d.symbol && (
                      <span className="text-[9px] font-mono font-semibold text-primary">{d.symbol}</span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-muted">{fmtDate(d.date)}</span>
                </div>
                {!isShort && d.client && (
                  <p className="text-[11px] font-mono text-primary">{d.client}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[9px] font-mono text-muted">Qty: {d.quantity.toLocaleString("en-IN")}</span>
                  {d.price != null && d.price > 0 && (
                    <span className="text-[9px] font-mono text-muted">@ ₹{d.price.toFixed(2)}</span>
                  )}
                  {d.valueCr != null && d.valueCr > 0 && (
                    <span className="text-[9px] font-mono font-semibold text-amber">{fmtCr(d.valueCr)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </ActivityColumn>
      </div>
    </div>
  );
}
