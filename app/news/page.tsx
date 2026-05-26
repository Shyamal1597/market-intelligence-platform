"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Search, TrendingUp, ExternalLink, Clock } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  link: string;
  content?: string;
  pubDate: string;
  source?: string;
  image?: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function stripHtml(html: string): string {
  return (html ?? "").replace(/<[^>]*>/g, "").substring(0, 200);
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filtered, setFiltered] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-news?limit=200&source=${selectedSource}`);
      const data = await res.json();
      setNews(data.news ?? []);
      setSources(["all", ...(data.sources ?? [])]);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSource]);

  useEffect(() => {
    setLoading(true);
    fetchNews();
    const interval = setInterval(fetchNews, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(news);
      return;
    }
    const id = setTimeout(() => {
      const q = query.toLowerCase();
      setFiltered(
        news.filter(
          (n) =>
            n.title?.toLowerCase().includes(q) ||
            n.source?.toLowerCase().includes(q) ||
            n.content?.toLowerCase().includes(q)
        )
      );
    }, 300);
    return () => clearTimeout(id);
  }, [news, query]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch("/api/fetch-market-news");
    await fetchNews();
  };

  const [top, ...rest] = filtered;
  const secondRow = rest.slice(0, 2);
  const compact = rest.slice(2);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Market News
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">
            {filtered.length} stories · auto-refreshes every 10 min
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-muted hover:text-primary hover:border-amber/30 transition-all font-sans disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Fetching…" : "Refresh"}
        </button>
      </div>

      {/* Search + Source Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search stories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-amber/50 font-sans w-64 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSource(s)}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wide border transition-all ${
                selectedSource === s
                  ? "bg-amber/10 text-amber border-amber/40"
                  : "bg-surface text-muted border-border hover:text-primary hover:border-border-strong"
              }`}
            >
              {s === "all" ? "ALL SOURCES" : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-border border-t-amber rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-display text-2xl">No stories found</p>
          {query && (
            <button
              onClick={() => setQuery("")}
              className="mt-4 text-xs font-mono text-amber hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Top story — full-width editorial banner */}
          {top && (
            <a
              href={top.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block border-t-2 border-t-amber border border-border bg-surface hover:bg-surface/80 p-8 mb-px transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-mono text-amber uppercase tracking-widest">
                  {top.source ?? "News"} · Top Story
                </span>
                <span className="flex items-center gap-1 text-xs font-mono text-muted">
                  <Clock className="w-3 h-3" /> {timeAgo(top.pubDate)}
                </span>
              </div>
              <h2 className="font-display text-4xl lg:text-5xl font-semibold text-primary group-hover:text-amber transition-colors leading-tight mb-3">
                {top.title}
              </h2>
              {top.content && (
                <p className="text-muted text-base leading-relaxed max-w-3xl font-sans">
                  {stripHtml(top.content)}
                </p>
              )}
              <div className="flex items-center gap-1 mt-4 text-amber text-sm font-mono">
                Read full story <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </div>
            </a>
          )}

          {/* Second row — 2 equal stories */}
          {secondRow.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 border-x border-b border-border mb-px">
              {secondRow.map((item) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-6 border-r last:border-r-0 border-border bg-surface hover:bg-surface/80 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-amber/70 uppercase tracking-wider">
                      {item.source}
                    </span>
                    <span className="text-xs font-mono text-muted">{timeAgo(item.pubDate)}</span>
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-primary group-hover:text-amber transition-colors leading-snug">
                    {item.title}
                  </h3>
                </a>
              ))}
            </div>
          )}

          {/* Compact list */}
          {compact.length > 0 && (
            <div className="border border-border divide-y divide-border bg-surface">
              {compact.map((item) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-6 px-6 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs font-mono text-amber/70 uppercase tracking-wider shrink-0 w-24 truncate">
                      {item.source}
                    </span>
                    <span className="font-sans text-sm text-primary group-hover:text-amber transition-colors line-clamp-1">
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-muted">{timeAgo(item.pubDate)}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
