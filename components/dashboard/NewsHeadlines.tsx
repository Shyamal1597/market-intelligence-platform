"use client";

import { useEffect, useState } from "react";

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source?: string;
  pubDate: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

const SOURCE_BADGE_STYLE: Record<string, string> = {
  // Indian sources
  Moneycontrol:         "text-orange-400 bg-orange-500/10 border border-orange-500/20",
  "Economic Times":     "text-sky-400 bg-sky-500/10 border border-sky-500/20",
  "Business Standard":  "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20",
  Mint:                 "text-teal bg-teal/10 border border-teal/25",
  "NDTV Profit":        "text-rose-400 bg-rose-500/10 border border-rose-500/20",
  "BQ Prime":           "text-violet-400 bg-violet-500/10 border border-violet-500/20",
  VCCircle:             "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  "The Hindu":          "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20",
  "Times of India":     "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20",
  // Global
  Reuters:              "text-slate-400 bg-white/[0.05] border border-white/10",
  "Financial Times":    "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  CNBC:                 "text-blue-400 bg-blue-500/10 border border-blue-500/20",
  MarketWatch:          "text-green-400 bg-green-500/10 border border-green-500/20",
};

const SOURCE_ABBREV: Record<string, string> = {
  "Moneycontrol":       "MC",
  "Economic Times":     "ET",
  "Business Standard":  "BS",
  "Mint":               "MINT",
  "NDTV Profit":        "NDTV",
  "BQ Prime":           "BQ",
  "VCCircle":           "VCC",
  "The Hindu":          "TH",
  "Times of India":     "TOI",
  "Reuters":            "REU",
  "Financial Times":    "FT",
  "CNBC":               "CNBC",
  "MarketWatch":        "MW",
};

function getBadgeStyle(source: string): string {
  return SOURCE_BADGE_STYLE[source] ?? "text-muted bg-white/[0.03] border border-white/10";
}

function getSourceAbbrev(source: string): string {
  return SOURCE_ABBREV[source] ?? source.substring(0, 4).toUpperCase();
}

export function NewsHeadlines() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market-news?limit=8")
      .then((r) => r.json())
      .then((d) => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Section header — terminal label style */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] tracking-widest text-amber/70 uppercase">
          Market Headlines
        </span>
        <div className="flex-1 h-px bg-[#1E2235]" />
        {!loading && (
          <span className="font-mono text-[10px] text-muted">
            {news.length} items
          </span>
        )}
        <a
          href="/news"
          className="font-mono text-[10px] text-amber hover:underline ml-1"
        >
          All news →
        </a>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="divide-y divide-[#1E2235]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-4 bg-[#1E2235] rounded w-full mb-1.5" />
              <div className="h-3 bg-[#1E2235] rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && news.length === 0 && (
        <p className="text-muted text-sm font-mono py-4">
          No news yet — refresh to fetch latest stories.
        </p>
      )}

      {/* News rows */}
      {!loading && news.length > 0 && (
        <div className="divide-y divide-[#1E2235]">
          {news.slice(0, 8).map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 py-3 hover:bg-white/[0.02] transition-colors -mx-4 px-4"
            >
              {/* Source badge — color-coded by publication */}
              {item.source && (
                <span className={`font-mono text-[9px] rounded px-1.5 py-0.5 shrink-0 leading-tight ${getBadgeStyle(item.source ?? "")}`}>
                  {getSourceAbbrev(item.source ?? "")}
                </span>
              )}
              {/* Time */}
              <span className="font-mono text-[10px] text-muted shrink-0 w-7 text-right">
                {timeAgo(item.pubDate)}
              </span>
              {/* Headline */}
              <span className="text-sm text-primary group-hover:text-amber transition-colors truncate font-sans">
                {item.title}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
