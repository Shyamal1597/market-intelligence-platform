// components/portfolio/PortfolioActivityPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { Newspaper, FileText, Shuffle } from "lucide-react";
import { ActivityColumn } from "./ActivityColumn";

interface NewsItem {
  title: string;
  source: string;
  pubDate: string;
  link: string | null;
}
interface FilingItem {
  id: string;
  company: string;
  filingType: string;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}
interface DealItem {
  id: string;
  type: string;
  date: string;
  symbol?: string;
  client: string;
  side: string;
  quantity: number;
  price: number | null;
  valueCr: number | null;
}
interface ActivityData {
  symbol: string | null;
  news: { items: NewsItem[]; fetchedAt: string };
  filings: { items: FilingItem[]; fetchedAt: string };
  deals: { items: DealItem[]; fetchedAt: string };
}
interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtCr(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toFixed(2) + " Cr";
}

export function PortfolioActivityPanel({
  symbol,
  name,
}: {
  symbol: string | null;
  name: string | null;
}) {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActivity(null);
    setQuote(null);
    setLoading(true);

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
      fetch("/api/portfolio/general/activity")
        .then((r) => r.json())
        .then((data) => {
          setActivity(data as ActivityData);
          setLoading(false);
        });
    }
  }, [symbol]);

  const up = (quote?.changePercent ?? 0) >= 0;
  const isGeneral = !symbol;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-[#1E2235] shrink-0"
        style={{ background: "rgba(255,255,255,0.015)" }}
      >
        <div className="flex flex-col">
          <span className="text-sm font-mono font-semibold" style={{ color: "#F0EDE8" }}>
            {isGeneral ? "Market Overview" : name}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#6B7280" }}>
            {isGeneral
              ? "Live feed across all instruments"
              : `${symbol} · NSE`}
          </span>
        </div>
        {quote && !isGeneral && (
          <div className="flex items-center gap-3">
            <span className="text-lg font-mono font-semibold" style={{ color: "#F0EDE8" }}>
              ₹{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
            <span
              className="text-[11px] font-mono font-semibold"
              style={{ color: up ? "#00E5FF" : "#E84040" }}
            >
              {up ? "+" : ""}{quote.changePercent.toFixed(2)}%
            </span>
          </div>
        )}
        {isGeneral && (
          <span
            className="text-[9px] font-mono px-2 py-1 rounded"
            style={{ background: "rgba(245,130,13,0.1)", color: "#F5820D" }}
          >
            ALL INSTRUMENTS
          </span>
        )}
      </div>

      {/* 3-column grid */}
      <div className="flex-1 grid grid-cols-3 min-h-0 overflow-hidden">
        {/* News */}
        <ActivityColumn
          title="Market News"
          icon={<Newspaper className="w-3.5 h-3.5" />}
          count={activity?.news.items.length ?? 0}
          loading={loading}
          empty={!loading && (activity?.news.items.length ?? 0) === 0}
        >
          {activity?.news.items.map((n, i) => (
            <div
              key={i}
              className="p-2.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2235" }}
            >
              {n.link ? (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono leading-relaxed hover:underline"
                  style={{ color: "#F0EDE8" }}
                >
                  {n.title}
                </a>
              ) : (
                <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F0EDE8" }}>
                  {n.title}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] font-mono" style={{ color: "#F5820D" }}>
                  {n.source}
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#6B7280" }}>
                  {fmtDate(n.pubDate)}
                </span>
              </div>
            </div>
          ))}
        </ActivityColumn>

        {/* Filings */}
        <ActivityColumn
          title="NSE Filings"
          icon={<FileText className="w-3.5 h-3.5" />}
          count={activity?.filings.items.length ?? 0}
          loading={loading}
          empty={!loading && (activity?.filings.items.length ?? 0) === 0}
        >
          {activity?.filings.items.map((f) => (
            <div
              key={f.id}
              className="p-2.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2235" }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span
                  className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(245,130,13,0.1)", color: "#F5820D" }}
                >
                  {f.filingType}
                </span>
                <span className="text-[9px] font-mono shrink-0" style={{ color: "#6B7280" }}>
                  {fmtDate(f.submittedAt)}
                </span>
              </div>
              {isGeneral && f.company && (
                <p className="text-[9px] font-mono mb-0.5" style={{ color: "#F5820D" }}>
                  {f.company}
                </p>
              )}
              <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F0EDE8" }}>
                {f.description || f.filingType}
              </p>
              {f.pdfUrl && (
                <a
                  href={f.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono mt-1.5 inline-block hover:underline"
                  style={{ color: "#00E5FF" }}
                >
                  View filing →
                </a>
              )}
            </div>
          ))}
        </ActivityColumn>

        {/* Deals */}
        <ActivityColumn
          title="Bulk / Block / Short"
          icon={<Shuffle className="w-3.5 h-3.5" />}
          count={activity?.deals.items.length ?? 0}
          loading={loading}
          empty={!loading && (activity?.deals.items.length ?? 0) === 0}
        >
          {activity?.deals.items.map((d) => (
            <div
              key={d.id}
              className="p-2.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1E2235" }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: d.side === "BUY" ? "rgba(0,229,255,0.1)" : "rgba(232,64,64,0.1)",
                      color: d.side === "BUY" ? "#00E5FF" : "#E84040",
                    }}
                  >
                    {d.side}
                  </span>
                  <span className="text-[9px] font-mono uppercase" style={{ color: "#6B7280" }}>
                    {d.type}
                  </span>
                  {isGeneral && d.symbol && (
                    <span
                      className="text-[9px] font-mono font-semibold"
                      style={{ color: "#F0EDE8" }}
                    >
                      {d.symbol}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-mono" style={{ color: "#6B7280" }}>
                  {fmtDate(d.date)}
                </span>
              </div>
              <p className="text-[11px] font-mono" style={{ color: "#F0EDE8" }}>
                {d.client}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[9px] font-mono" style={{ color: "#6B7280" }}>
                  Qty: {d.quantity.toLocaleString("en-IN")}
                </span>
                {d.price != null && (
                  <span className="text-[9px] font-mono" style={{ color: "#6B7280" }}>
                    @ ₹{d.price.toFixed(2)}
                  </span>
                )}
                {d.valueCr != null && (
                  <span className="text-[9px] font-mono font-semibold" style={{ color: "#F5820D" }}>
                    {fmtCr(d.valueCr)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </ActivityColumn>
      </div>
    </div>
  );
}
