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
  Moneycontrol: "text-orange-400 bg-orange-500/10 border border-orange-500/20",
  "Economic Times": "text-sky-400 bg-sky-500/10 border border-sky-500/20",
  "Business Standard": "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20",
  Mint: "text-teal bg-teal/10 border border-teal/25",
  "NDTV Profit": "text-rose-400 bg-rose-500/10 border border-rose-500/20",
  "BQ Prime": "text-violet-400 bg-violet-500/10 border border-violet-500/20",
  VCCircle: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  "The Hindu": "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20",
  "Times of India": "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20",
  // Global
  Reuters: "text-slate-400 bg-white/[0.05] border border-white/10",
  "Financial Times": "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  CNBC: "text-blue-400 bg-blue-500/10 border border-blue-500/20",
  MarketWatch: "text-green-400 bg-green-500/10 border border-green-500/20",
};

const SOURCE_ABBREV: Record<string, string> = {
  "Moneycontrol": "MC",
  "Economic Times": "ET",
  "Business Standard": "BS",
  "Mint": "MINT",
  "NDTV Profit": "NDTV",
  "BQ Prime": "BQ",
  "VCCircle": "VCC",
  "The Hindu": "TH",
  "Times of India": "TOI",
  "Reuters": "REU",
  "Financial Times": "FT",
  "CNBC": "CNBC",
  "MarketWatch": "MW",
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
    fetch("/api/market-news?limit=12")
      .then((r) => r.json())
      .then((d) => setNews(d.news ?? []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col h-full relative overflow-hidden transition-all duration-500 hover:shadow-lg hover:shadow-cyan-500/5 hover:border-white/10">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-teal/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <span className="font-display font-semibold tracking-wide text-teal text-sm uppercase">
          Market Headlines
        </span>
        <div className="flex-1 h-px bg-border-strong" />
        {!loading && (
          <span className="font-mono text-[10px] text-muted">
            {news.length} items
          </span>
        )}
        <a
          href="/news"
          className="font-mono text-[10px] text-teal hover:underline hover:text-glow ml-1 transition-all"
        >
          All news →
        </a>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="divide-y divide-border relative z-10">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-4 bg-border-strong rounded w-full mb-1.5" />
              <div className="h-3 bg-border rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && news.length === 0 && (
        <p className="text-muted text-sm font-sans py-4 relative z-10">
          No news yet — refresh to fetch latest stories.
        </p>
      )}

      {/* News rows */}
      {!loading && news.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 w-full pb-2">
          {news.slice(0, 12).map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col justify-between p-4 rounded-xl border border-border bg-surface-raised hover:bg-white/[0.04] hover:border-teal/30 hover:shadow-md hover:shadow-teal/5 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                {/* Source badge */}
                {item.source ? (
                  <span className={`font-mono text-[9px] rounded px-2 py-0.5 font-medium ${getBadgeStyle(item.source)}`}>
                    {item.source}
                  </span>
                ) : (
                  <span />
                )}
                {/* Time */}
                <span className="font-mono text-[10px] text-muted whitespace-nowrap bg-surface px-1.5 py-0.5 rounded">
                  {timeAgo(item.pubDate)}
                </span>
              </div>

              {/* Headline */}
              <h3 className="text-sm font-medium text-primary group-hover:text-teal transition-colors line-clamp-3 leading-snug">
                {item.title}
              </h3>

              {/* Read more indicator */}
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-muted uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Read article</span>
                <span className="text-teal group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
