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

/** Abbreviate source names to 2–4 char badges */
const SOURCE_ABBR: Record<string, string> = {
  Moneycontrol: "MC",
  "ET Markets": "ET",
  "Economic Times": "ET",
  "Business Standard": "BS",
  Reuters: "REU",
  "Financial Times": "FT",
  LiveMint: "MINT",
  Mint: "MINT",
  "NDTV Profit": "NDTV",
  Bloomberg: "BBG",
  "CNBC TV18": "CNBC",
  CNBC: "CNBC",
};

function getAbbr(source: string): string {
  return SOURCE_ABBR[source] ?? source.slice(0, 3).toUpperCase();
}

/** Color-coded badge style per source abbreviation */
const SOURCE_BADGE_STYLE: Record<string, string> = {
  MC:   "text-orange-400 bg-orange-500/10 border border-orange-500/20",
  ET:   "text-sky-400   bg-sky-500/10    border border-sky-500/20",
  BS:   "text-cyan-400  bg-cyan-500/10   border border-cyan-500/20",
  REU:  "text-slate-400 bg-white/[0.05]  border border-white/10",
  FT:   "text-amber-400 bg-amber-500/10  border border-amber-500/20",
  MINT: "text-teal      bg-teal/10       border border-teal/25",
  NDTV: "text-rose-400  bg-rose-500/10   border border-rose-500/20",
  BBG:  "text-violet-400 bg-violet-500/10 border border-violet-500/20",
  CNBC: "text-blue-400  bg-blue-500/10   border border-blue-500/20",
};
const DEFAULT_BADGE_STYLE = "text-muted bg-[#1E2235] border border-white/5";

function getSourceBadgeStyle(abbr: string): string {
  return SOURCE_BADGE_STYLE[abbr] ?? DEFAULT_BADGE_STYLE;
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
                <span className={`font-mono text-[9px] rounded px-1.5 py-0.5 shrink-0 leading-tight ${getSourceBadgeStyle(getAbbr(item.source))}`}>
                  {getAbbr(item.source)}
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
