"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Clock } from "lucide-react";

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
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-5 bg-[#1E2235] rounded w-full mb-1" />
            <div className="h-3 bg-[#1E2235] rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <p className="text-muted text-sm font-sans py-4">
        No news yet — refresh to fetch latest stories.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[#1E2235]">
      {news.slice(0, 7).map((item, i) => (
        <a
          key={item.id}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start justify-between gap-4 py-4 hover:bg-white/[0.02] transition-colors -mx-4 px-4 first:-mt-0"
        >
          <div className="flex-1 min-w-0">
            <p
              className={`font-display leading-snug group-hover:text-amber transition-colors ${
                i === 0
                  ? "text-2xl font-semibold text-primary"
                  : "text-base text-primary/90"
              }`}
            >
              {item.title}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              {item.source && (
                <span className="text-xs font-mono text-amber/70 uppercase tracking-wider">
                  {item.source}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-muted font-mono">
                <Clock className="w-3 h-3" />
                {timeAgo(item.pubDate)}
              </span>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted group-hover:text-amber shrink-0 mt-1 transition-colors" />
        </a>
      ))}
    </div>
  );
}
