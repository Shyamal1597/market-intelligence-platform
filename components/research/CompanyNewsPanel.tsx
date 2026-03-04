"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source?: string;
}

interface Props {
  companyName: string;
  symbol: string;
}

export function CompanyNewsPanel({ companyName, symbol }: Props) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market-news?limit=200")
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((data: { news: NewsItem[] }) => {
        const lower = companyName.toLowerCase();
        const sym = symbol.toLowerCase();
        const filtered = data.news
          .filter(
            (n) =>
              n.title.toLowerCase().includes(lower) ||
              n.title.toLowerCase().includes(sym)
          )
          .slice(0, 5);
        setNews(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyName, symbol]);

  if (loading)
    return <div className="animate-pulse h-32 bg-[#1E2235] rounded-xl" />;

  return (
    <div className="border border-[#1E2235] rounded-xl bg-surface p-4">
      <h3 className="text-xs font-mono text-muted tracking-widest mb-3 uppercase">
        Recent News
      </h3>
      {news.length === 0 ? (
        <p className="text-muted text-xs font-mono">No recent mentions found.</p>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 hover:bg-white/[0.03] rounded p-1 -mx-1 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-sans text-primary group-hover:text-amber transition-colors leading-snug line-clamp-2">
                  {item.title}
                </p>
                <p className="text-[10px] font-mono text-muted mt-0.5">
                  {item.source} ·{" "}
                  {new Date(item.pubDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-muted shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
