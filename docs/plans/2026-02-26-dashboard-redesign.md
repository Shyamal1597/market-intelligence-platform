# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the dashboard into a professional research command center — hero metrics row with sparklines, flat-row news and filings panels, Sunidhi brand identity in the sidebar, Sunidhi orange accent color.

**Architecture:** Seven independent, sequentially-committed changes. No new dependencies. All data comes from existing `/api/macro`, `/api/market-news`, and `/api/filings` routes. New `MetricsRow` component replaces `MacroTiles` on the dashboard (MacroTiles stays for `/macro` page). `TickerStrip` removed from layout (file kept). `QuickLinksPreview` removed from dashboard (file kept).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Recharts (existing), Lucide React (existing).

---

## Key Data Shapes (read before coding)

`/api/macro` returns:
```ts
{ quotes: Array<{ symbol: string; label: string; price: number; change: number; changePercent: number; previousClose: number; history: number[] }> }
```

`/api/market-news?limit=8` returns:
```ts
{ news: Array<{ id: string; title: string; link: string; source?: string; pubDate: string }> }
```

`/api/filings?limit=8` returns:
```ts
{ filings: Array<{ id: string; company: string; category: FilingCategory; filingType: string; description: string; submittedAt: string; pdfUrl: string | null }> }
```

Existing `Sparkline` component props: `data: number[]`, `positive: boolean`. Height is hardcoded to 40px.

---

## Task 1: Update Accent Color to Sunidhi Orange

**Files:**
- Modify: `app/globals.css`

**Step 1: Change the amber token**

In `app/globals.css`, find line:
```css
  --color-amber:   #E8A020;
```
Change to:
```css
  --color-amber:   #F5820D;
```

Also update the `@keyframes flash` which references the old amber value:
```css
@keyframes flash {
  from { background-color: rgba(245, 130, 13, 0.3); }
  to   { background-color: transparent; }
}
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes with no errors. All existing amber-colored UI now renders in Sunidhi orange `#F5820D`.

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add app/globals.css && git commit -m "style: update accent color to Sunidhi brand orange #F5820D"
```

---

## Task 2: Sunidhi Brand Identity in Sidebar

**Files:**
- Modify: `components/layout/Sidebar.tsx`

**Step 1: Replace the logo block**

Find and replace the entire Logo section (the `{/* Logo */}` comment block) in `Sidebar.tsx`.

Current code to replace:
```tsx
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-amber flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-[#0C0E14]" />
          </div>
          {expanded && (
            <span className="font-display text-lg font-semibold text-primary whitespace-nowrap tracking-wide">
              Sunidhi
            </span>
          )}
        </div>
      </div>
```

Replace with:
```tsx
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Sunidhi brand mark: red square with S initial */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 select-none"
            style={{ backgroundColor: "#CC1F37" }}
          >
            <span className="font-display font-bold text-white text-base leading-none">
              S
            </span>
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <span className="font-display text-base font-semibold text-primary whitespace-nowrap tracking-wide block leading-tight">
                SUNIDHI
              </span>
              <span className="font-mono text-[9px] text-muted whitespace-nowrap tracking-wider uppercase block">
                Securities &amp; Finance
              </span>
            </div>
          )}
        </div>
      </div>
```

**Step 2: Remove the `Activity` import** since it's no longer used.

Find:
```tsx
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  BookMarked,
  ChevronRight,
  Activity,
} from "lucide-react";
```

Replace with:
```tsx
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  BookMarked,
  ChevronRight,
} from "lucide-react";
```

**Step 3: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes with no TypeScript errors.

**Step 4: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add components/layout/Sidebar.tsx && git commit -m "style: replace generic icon with Sunidhi brand mark in sidebar"
```

---

## Task 3: Remove TickerStrip from Layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Remove TickerStrip from layout**

Find and remove the TickerStrip import line:
```tsx
import { TickerStrip } from "@/components/layout/TickerStrip";
```

Find and remove the `<TickerStrip />` render:
```tsx
          <TickerStrip />
```

The file should now look like:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export const metadata: Metadata = {
  title: "Sunidhi Research Intelligence",
  description: "Internal research platform for Sunidhi Capital",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-base text-primary antialiased">
        <Sidebar />
        {/* Main area: offset by sidebar width (64px collapsed) */}
        <div className="ml-16 flex flex-col min-h-screen">
          <TopBar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes. No TickerStrip references should cause errors.

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add app/layout.tsx && git commit -m "style: remove TickerStrip from layout — hero metrics row replaces it"
```

---

## Task 4: Create MetricsRow Component

**Files:**
- Create: `components/dashboard/MetricsRow.tsx`

**Step 1: Create the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "@/components/macro/Sparkline";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  history: number[];
}

/** Format price by symbol type — mirrors MacroTiles logic */
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(1);
  if (price > 10000)
    return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function MetricTile({ quote }: { quote: Quote }) {
  const up = quote.changePercent >= 0;
  const valueColor = up ? "text-teal" : "text-danger";
  const borderColor = up ? "border-teal" : "border-danger";

  return (
    <div
      className={`bg-surface border border-[#1E2235] border-l-2 ${borderColor} rounded-xl p-4 hover:bg-white/[0.02] transition-colors flex flex-col justify-between`}
    >
      <div>
        <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-1.5">
          {quote.label}
        </p>
        <p className="font-mono text-xl font-bold text-primary leading-none mb-1">
          {formatPrice(quote.price, quote.symbol)}
        </p>
        <p className={`font-mono text-xs ${valueColor} flex items-center gap-1`}>
          {up ? (
            <TrendingUp className="w-3 h-3 shrink-0" />
          ) : (
            <TrendingDown className="w-3 h-3 shrink-0" />
          )}
          {up ? "+" : ""}
          {quote.change.toFixed(2)}&nbsp;&nbsp;{up ? "+" : ""}
          {quote.changePercent.toFixed(2)}%
        </p>
      </div>
      {quote.history && quote.history.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={quote.history} positive={up} />
        </div>
      )}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="bg-surface border border-[#1E2235] rounded-xl p-4 animate-pulse h-[120px]" />
  );
}

export function MetricsRow() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => {
        setQuotes(d.quotes ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tiles = loading
    ? Array.from({ length: 5 })
    : quotes.slice(0, 5);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {loading
        ? tiles.map((_, i) => <SkeletonTile key={i} />)
        : (tiles as Quote[]).map((q) => <MetricTile key={q.symbol} quote={q} />)}
    </div>
  );
}
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes with no TypeScript errors.

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add components/dashboard/MetricsRow.tsx && git commit -m "feat: add MetricsRow hero component — 5 tiles with price, change, sparkline"
```

---

## Task 5: Refactor NewsHeadlines to Flat Rows

**Files:**
- Modify: `components/dashboard/NewsHeadlines.tsx`

**Step 1: Replace the entire file content**

```tsx
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
        <span className="font-mono text-[10px] tracking-widest text-muted uppercase">
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
              {/* Source badge */}
              {item.source && (
                <span className="font-mono text-[9px] text-muted bg-[#1E2235] rounded px-1.5 py-0.5 shrink-0 leading-tight">
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
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes. No TypeScript errors. Note: `ExternalLink` and `Clock` imports are removed — that's intentional.

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add components/dashboard/NewsHeadlines.tsx && git commit -m "style: refactor NewsHeadlines to flat terminal rows with source badges"
```

---

## Task 6: Refactor DashboardFilings to Flat Rows

**Files:**
- Modify: `components/dashboard/DashboardFilings.tsx`

**Step 1: Replace the entire file content**

```tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { FilingCategory } from "@/lib/bse-filings";

interface Filing {
  id: string;
  company: string;
  category: FilingCategory;
  filingType: string;
  description: string;
  submittedAt: string;
  pdfUrl: string | null;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function DashboardFilings() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const load = () => {
    fetch("/api/filings?limit=8")
      .then((r) => r.json())
      .then((d) => {
        if (!mountedRef.current) return;
        setFilings(d.filings ?? []);
        setLastUpdated(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(load, 120_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  const updatedLabel = lastUpdated
    ? `Updated ${timeAgo(lastUpdated.toISOString())} ago`
    : null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] tracking-widest text-muted uppercase">
          BSE Filings
        </span>
        {/* Live pulse dot */}
        <span className="flex items-center gap-1 font-mono text-[10px] text-danger">
          <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
          LIVE
        </span>
        <div className="flex-1 h-px bg-[#1E2235]" />
        {!loading && (
          <span className="font-mono text-[10px] text-muted">
            {filings.length}
          </span>
        )}
        <a
          href="/filings"
          className="font-mono text-[10px] text-amber hover:underline ml-1"
        >
          All →
        </a>
      </div>

      {/* Updated label */}
      {updatedLabel && (
        <p className="font-mono text-[9px] text-muted/50 mb-2 text-right">
          {updatedLabel}
        </p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="divide-y divide-[#1E2235]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-3 bg-[#1E2235] rounded w-16 mb-2" />
              <div className="h-4 bg-[#1E2235] rounded w-full mb-1" />
              <div className="h-3 bg-[#1E2235] rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filings.length === 0 && (
        <p className="text-muted text-sm font-mono py-4">
          No filings available.
        </p>
      )}

      {/* Filing rows */}
      {!loading && filings.length > 0 && (
        <div className="divide-y divide-[#1E2235]">
          {filings.slice(0, 8).map((f) => {
            const row = (
              <div className="py-3 group">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge label={f.filingType} variant={f.category} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted">
                      {timeAgo(f.submittedAt)}
                    </span>
                    {f.pdfUrl && (
                      <ExternalLink className="w-3 h-3 text-muted group-hover:text-amber transition-colors shrink-0" />
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-primary font-sans leading-tight truncate group-hover:text-amber transition-colors">
                  {f.company}
                </p>
                <p className="text-xs text-muted truncate mt-0.5 font-sans">
                  {f.description}
                </p>
              </div>
            );

            return f.pdfUrl ? (
              <a
                key={f.id}
                href={f.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-white/[0.02] transition-colors -mx-4 px-4"
              >
                {row}
              </a>
            ) : (
              <div key={f.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes with no errors.

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add components/dashboard/DashboardFilings.tsx && git commit -m "style: refactor DashboardFilings to flat rows with live badge and update timer"
```

---

## Task 7: Rewrite Dashboard Page Layout

**Files:**
- Modify: `app/page.tsx`

**Step 1: Replace the entire file**

```tsx
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-4">
      {/* Hero: live market metrics with sparklines */}
      <MetricsRow />

      {/* Two-column body: news (60%) + filings (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Market Headlines */}
        <div className="lg:col-span-3 bg-surface border border-[#1E2235] rounded-xl p-4">
          <NewsHeadlines />
        </div>

        {/* BSE Filings */}
        <div className="lg:col-span-2 bg-surface border border-[#1E2235] rounded-xl p-4">
          <DashboardFilings />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build passes**

```bash
cd "D:\Sunidhi Intranet" && npm run build
```
Expected: Build completes. No unused import warnings. `MacroTiles` and `QuickLinksPreview` are no longer imported here (they still exist for other pages).

**Step 3: Commit**

```bash
cd "D:\Sunidhi Intranet" && git add app/page.tsx && git commit -m "feat: redesign dashboard — hero metrics row, flat news/filings panels, remove quick links"
```

---

## Verification Checklist

After all 7 tasks are committed, start the dev server and confirm visually:

```bash
cd "D:\Sunidhi Intranet" && npm run dev -- -p 3001
```

Open `http://localhost:3001` and verify:

- [ ] Sidebar brand mark: red square with white `S` (collapsed), `SUNIDHI / Securities & Finance` (expanded)
- [ ] No ticker strip below the TopBar
- [ ] Hero row: 5 metric tiles with price, change%, and sparkline, teal/danger left border
- [ ] News section: flat rows with source badge, time, headline. No display-font cards.
- [ ] Filings section: flat rows with Badge, company name, description, time. "Updated X ago" visible.
- [ ] Both sections fill full available height with their divide lines
- [ ] Accent color is orange (`#F5820D`), not golden amber
- [ ] Build passes: `npm run build` exits 0
