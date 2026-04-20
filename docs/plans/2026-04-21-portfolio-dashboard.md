# Portfolio Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated `/portfolio` page with a localStorage portfolio list, master-detail layout (sidebar + 3-column activity panel), and a single aggregated API endpoint that returns company-specific News, NSE Filings, and Bulk/Block/Short Deals for any selected symbol.

**Architecture:** Per-browser localStorage stores the portfolio (`portfolio_v1` key). A new `/api/portfolio/[symbol]/activity` route aggregates all three data streams server-side in `Promise.all` and returns one payload. The page is a `"use client"` master-detail layout — sidebar on the left, 3-column activity panel on the right.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Lucide React, existing lib functions (`getStockNews`, `fetchNSEFilings`, `fetchBulkDeals`, `fetchBlockDeals`, `fetchShortDeals`), existing API routes (`/api/nse-symbols`, `/api/quote/[symbol]`).

---

## Reference Files (read before starting)

- `lib/smart-money.ts` — `getStockNews(symbol, limit)` exported function (title+content match, uses suffix-stripping). Lines 115–155.
- `lib/nse-filings.ts` — `fetchNSEFilings(limit)` returns `NSEFiling[]`. Filter on `filing.scripCode === symbol`.
- `lib/nse-deals.ts` — `fetchBulkDeals()`, `fetchBlockDeals()`, `fetchShortDeals()`. `Deal` interface has `symbol: string` field (NSE ticker, uppercase).
- `app/api/nse-symbols/route.ts` — autocomplete endpoint, returns `{ symbols: string[] }`.
- `app/api/quote/[symbol]/route.ts` — returns `{ price, change, changePercent }` or 404.
- `components/layout/Sidebar.tsx` — NAV array, add entry here.
- `docs/plans/2026-04-21-portfolio-dashboard-design.md` — approved design doc.

---

## Task 1: Export `getSearchTerms` from `lib/smart-money.ts`

**Files:**
- Modify: `lib/smart-money.ts`

The `getSearchTerms` function is currently private (no `export`). The activity API route needs it for title-only news matching. Add `export` keyword.

**Step 1: Add export**

Find line ~115 in `lib/smart-money.ts`:
```ts
function getSearchTerms(symbol: string): string[] {
```
Change to:
```ts
export function getSearchTerms(symbol: string): string[] {
```

**Step 2: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```
Expected: no errors.

**Step 3: Commit**
```bash
git add lib/smart-money.ts
git commit -m "feat(smart-money): export getSearchTerms for reuse"
```

---

## Task 2: Create the aggregated activity API route

**Files:**
- Create: `app/api/portfolio/[symbol]/activity/route.ts`

This is the only server-side API call the portfolio page makes. It runs three fetches in `Promise.all` and returns one JSON payload.

**Step 1: Create directory and file**

```bash
mkdir -p "D:/Sunidhi-Intranet-Futuristic/app/api/portfolio/[symbol]/activity"
```

**Step 2: Write the route**

```ts
// app/api/portfolio/[symbol]/activity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStockNews, getSearchTerms } from "@/lib/smart-money";
import { fetchNSEFilings } from "@/lib/nse-filings";
import { fetchBulkDeals, fetchBlockDeals, fetchShortDeals } from "@/lib/nse-deals";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const NEWS_PATH = path.join(process.cwd(), "data", "market-news.json");

function getPortfolioNews(symbol: string, limit = 15) {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as {
      news: { title: string; source?: string; pubDate: string; link?: string }[];
    };
    const terms = getSearchTerms(symbol.toUpperCase());
    const matches = data.news.filter((n) => {
      const title = (n.title ?? "").toUpperCase();
      return terms.some((t) => title.includes(t));
    });
    return matches.slice(0, limit).map((n) => ({
      title: n.title,
      source: n.source ?? "Unknown",
      pubDate: n.pubDate,
      link: n.link ?? null,
    }));
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().trim();

  const [filingsResult, bulkResult, blockResult, shortResult] =
    await Promise.allSettled([
      fetchNSEFilings(500),
      fetchBulkDeals(),
      fetchBlockDeals(),
      fetchShortDeals(),
    ]);

  // News — title-only, no await needed (sync file read)
  const newsItems = getPortfolioNews(sym, 15);

  // Filings — filter by scripCode
  const filings =
    filingsResult.status === "fulfilled"
      ? filingsResult.value
          .filter((f) => f.scripCode === sym)
          .slice(0, 20)
          .map((f) => ({
            id: f.id,
            company: f.company,
            filingType: f.filingType,
            description: f.description,
            pdfUrl: f.pdfUrl,
            submittedAt: f.submittedAt,
          }))
      : [];

  // Deals — filter each type by symbol, combine
  const bulkDeals =
    bulkResult.status === "fulfilled"
      ? bulkResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const blockDeals =
    blockResult.status === "fulfilled"
      ? blockResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const shortDeals =
    shortResult.status === "fulfilled"
      ? shortResult.value.deals.filter((d) => d.symbol === sym)
      : [];

  const allDeals = [...bulkDeals, ...blockDeals, ...shortDeals]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map((d) => ({
      id: d.id,
      type: d.type,
      date: d.date,
      client: d.client,
      side: d.side,
      quantity: d.quantity,
      price: d.price,
      value: d.value,
    }));

  const now = new Date().toISOString();

  return NextResponse.json({
    symbol: sym,
    news: { items: newsItems, fetchedAt: now },
    filings: { items: filings, fetchedAt: now },
    deals: { items: allDeals, fetchedAt: now },
  });
}
```

**Step 3: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```
Expected: no errors. If `Deal` is missing a `price` or `value` field, check the interface in `lib/nse-deals.ts` and adjust the `.map()` accordingly.

**Step 4: Smoke-test with curl** (dev server must be running)
```bash
curl "http://localhost:3001/api/portfolio/RELIANCE/activity" | head -c 500
```
Expected: JSON with `{ symbol, news, filings, deals }` keys.

**Step 5: Commit**
```bash
git add "app/api/portfolio/[symbol]/activity/route.ts"
git commit -m "feat(portfolio): aggregated activity API — news, filings, deals per symbol"
```

---

## Task 3: Create `ActivityColumn.tsx` — reusable column shell

**Files:**
- Create: `components/portfolio/ActivityColumn.tsx`

This is a pure presentational component. It receives a title, icon, items array, a render function for each item, and a loading/empty state.

**Step 1: Create the component**

```tsx
// components/portfolio/ActivityColumn.tsx
"use client";

import { ReactNode } from "react";

interface ActivityColumnProps {
  title: string;
  icon: ReactNode;
  count: number;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}

export function ActivityColumn({
  title,
  icon,
  count,
  loading,
  empty,
  children,
}: ActivityColumnProps) {
  return (
    <div className="flex flex-col min-h-0 border-r border-[#1E2235] last:border-r-0">
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[#1E2235] shrink-0"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <span style={{ color: "#F5820D" }}>{icon}</span>
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#F0EDE8" }}
        >
          {title}
        </span>
        {!loading && count > 0 && (
          <span
            className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(245,130,13,0.12)",
              color: "#F5820D",
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Column body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "#1E2235" }}
              />
            ))}
          </div>
        )}
        {!loading && empty && (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-2">
            <span className="text-2xl opacity-30">—</span>
            <span
              className="text-[10px] font-mono text-center"
              style={{ color: "#6B7280" }}
            >
              No new activity detected
            </span>
          </div>
        )}
        {!loading && !empty && children}
      </div>
    </div>
  );
}
```

**Step 2: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 3: Commit**
```bash
git add components/portfolio/ActivityColumn.tsx
git commit -m "feat(portfolio): ActivityColumn reusable shell component"
```

---

## Task 4: Create `PortfolioActivityPanel.tsx` — 3-column main panel

**Files:**
- Create: `components/portfolio/PortfolioActivityPanel.tsx`

Fetches `/api/portfolio/[symbol]/activity` and renders 3 `ActivityColumn` components side-by-side plus a stock price header.

**Step 1: Write the component**

```tsx
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
  client: string;
  side: string;
  quantity: number;
  price: number | null;
  value: number | null;
}
interface ActivityData {
  symbol: string;
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

function fmtNum(n: number | null) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(1) + "Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(1) + "L";
  return n.toLocaleString("en-IN");
}

export function PortfolioActivityPanel({ symbol, name }: { symbol: string; name: string }) {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActivity(null);
    setQuote(null);
    setLoading(true);

    Promise.all([
      fetch(`/api/portfolio/${symbol}/activity`).then((r) => r.json()),
      fetch(`/api/quote/${symbol}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([activityData, quoteData]) => {
      setActivity(activityData as ActivityData);
      setQuote(quoteData as Quote | null);
      setLoading(false);
    });
  }, [symbol]);

  const up = (quote?.changePercent ?? 0) >= 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stock header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-[#1E2235] shrink-0"
        style={{ background: "rgba(255,255,255,0.015)" }}
      >
        <div className="flex flex-col">
          <span className="text-sm font-mono font-semibold" style={{ color: "#F0EDE8" }}>
            {name}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#6B7280" }}>
            {symbol} · NSE
          </span>
        </div>
        {quote && (
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
                  style={{
                    background: "rgba(245,130,13,0.1)",
                    color: "#F5820D",
                  }}
                >
                  {f.filingType}
                </span>
                <span className="text-[9px] font-mono shrink-0" style={{ color: "#6B7280" }}>
                  {fmtDate(f.submittedAt)}
                </span>
              </div>
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
                  <span
                    className="text-[9px] font-mono uppercase"
                    style={{ color: "#6B7280" }}
                  >
                    {d.type}
                  </span>
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
                {d.value != null && (
                  <span className="text-[9px] font-mono font-semibold" style={{ color: "#F5820D" }}>
                    {fmtNum(d.value)}
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
```

**Step 2: Check `Deal` interface for `price` and `value` fields**

Run:
```bash
grep -n "price\|value\|quantity" "D:/Sunidhi-Intranet-Futuristic/lib/nse-deals.ts" | head -20
```
If those fields don't exist on the `Deal` interface, adjust the API route in Task 2 and the types here accordingly.

**Step 3: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 4: Commit**
```bash
git add components/portfolio/PortfolioActivityPanel.tsx
git commit -m "feat(portfolio): PortfolioActivityPanel — 3-column activity view"
```

---

## Task 5: Create `PortfolioSidebar.tsx` — stock list + autocomplete

**Files:**
- Create: `components/portfolio/PortfolioSidebar.tsx`

This component manages the localStorage portfolio and renders the stock list with an add/remove UX. Uses `/api/nse-symbols` for autocomplete and `/api/quote/[symbol]` for validation before adding.

**Step 1: Write the component**

```tsx
// components/portfolio/PortfolioSidebar.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Plus, Loader2, AlertCircle } from "lucide-react";

const STORAGE_KEY = "portfolio_v1";

export interface PortfolioEntry {
  symbol: string;
  name: string;
  addedAt: string;
}

function loadPortfolio(): PortfolioEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioEntry[]) : [];
  } catch {
    return [];
  }
}

function savePortfolio(entries: PortfolioEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

interface Props {
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
}

export function PortfolioSidebar({ selected, onSelect }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [search, setSearch] = useState("");
  const [dropdown, setDropdown] = useState<string[]>([]);
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setPortfolio(loadPortfolio());
  }, []);

  // Persist whenever portfolio changes
  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  // Debounced autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) {
      setDropdown([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nse-symbols?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { symbols: string[] };
        setDropdown(data.symbols ?? []);
        setShowDropdown((data.symbols ?? []).length > 0);
        setDropdownIdx(-1);
      } catch {
        setDropdown([]);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        !searchRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addSymbol = useCallback(async (sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (!upper) return;

    // Already in portfolio
    if (portfolio.some((e) => e.symbol === upper)) {
      setError(`${upper} is already in your portfolio`);
      setSearch("");
      setShowDropdown(false);
      return;
    }

    setValidating(true);
    setError(null);
    setSearch("");
    setShowDropdown(false);

    try {
      const res = await fetch(`/api/quote/${upper}`);
      if (!res.ok) {
        setError(`${upper} not found on NSE`);
        return;
      }
      // Use the symbol as name for now — clean enough for internal use
      const entry: PortfolioEntry = {
        symbol: upper,
        name: upper,
        addedAt: new Date().toISOString(),
      };
      setPortfolio((prev) => [...prev, entry]);
      onSelect(upper, upper);
    } catch {
      setError("Failed to validate symbol. Try again.");
    } finally {
      setValidating(false);
    }
  }, [portfolio, onSelect]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || dropdown.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownIdx((i) => Math.min(i + 1, dropdown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (dropdownIdx >= 0) {
        addSymbol(dropdown[dropdownIdx]);
      } else if (search.trim()) {
        addSymbol(search.trim());
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  function remove(symbol: string) {
    setPortfolio((prev) => prev.filter((e) => e.symbol !== symbol));
  }

  return (
    <div
      className="flex flex-col h-full border-r border-[#1E2235]"
      style={{ width: "15rem", background: "rgba(255,255,255,0.015)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1E2235] shrink-0">
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#F5820D" }}
        >
          My Portfolio
        </span>
        <p className="text-[9px] font-mono mt-0.5" style={{ color: "#6B7280" }}>
          {portfolio.length} symbol{portfolio.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Add symbol search */}
      <div className="px-3 py-2.5 border-b border-[#1E2235] shrink-0">
        <div className="relative">
          <div className="relative">
            {validating ? (
              <Loader2
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin"
                style={{ color: "#F5820D" }}
              />
            ) : (
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "#6B7280" }}
              />
            )}
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => dropdown.length > 0 && setShowDropdown(true)}
              placeholder="Add symbol…"
              autoComplete="off"
              spellCheck={false}
              disabled={validating}
              className="w-full pl-8 pr-8 py-1.5 text-[11px] font-mono rounded-lg focus:outline-none transition-colors disabled:opacity-50"
              style={{
                background: "#13151E",
                border: "1px solid #1E2235",
                color: "#F0EDE8",
              }}
            />
            {search && !validating && (
              <button
                onClick={() => { setSearch(""); setShowDropdown(false); setError(null); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "#6B7280" }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && dropdown.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-2xl"
              style={{
                background: "#13151E",
                border: "1px solid #1E2235",
                maxHeight: "12rem",
                overflowY: "auto",
              }}
            >
              {dropdown.map((sym, i) => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addSymbol(sym); }}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono flex items-center gap-2 transition-colors"
                  style={{
                    background: i === dropdownIdx ? "rgba(245,130,13,0.1)" : "transparent",
                    color: i === dropdownIdx ? "#F5820D" : "#F0EDE8",
                  }}
                >
                  <Plus className="w-3 h-3 shrink-0 opacity-50" />
                  {sym}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Validation error */}
        {error && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <AlertCircle className="w-3 h-3 shrink-0" style={{ color: "#E84040" }} />
            <span className="text-[9px] font-mono" style={{ color: "#E84040" }}>
              {error}
            </span>
          </div>
        )}
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto py-1">
        {portfolio.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <span className="text-2xl opacity-20">📋</span>
            <span className="text-[10px] font-mono" style={{ color: "#6B7280" }}>
              Add symbols above to build your portfolio
            </span>
          </div>
        )}
        {portfolio.map((entry) => {
          const active = selected === entry.symbol;
          return (
            <div
              key={entry.symbol}
              className="flex items-center group px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors"
              style={{
                background: active ? "rgba(245,130,13,0.1)" : "transparent",
                border: active ? "1px solid rgba(245,130,13,0.2)" : "1px solid transparent",
              }}
              onClick={() => onSelect(entry.symbol, entry.name)}
            >
              {active && (
                <span
                  className="absolute left-0 w-[3px] h-5 rounded-r-full"
                  style={{ background: "#F5820D" }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[11px] font-mono font-semibold truncate"
                  style={{ color: active ? "#F5820D" : "#F0EDE8" }}
                >
                  {entry.symbol}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); remove(entry.symbol); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                style={{ color: "#6B7280" }}
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 3: Commit**
```bash
git add components/portfolio/PortfolioSidebar.tsx
git commit -m "feat(portfolio): PortfolioSidebar — localStorage portfolio list with validated autocomplete"
```

---

## Task 6: Create `app/portfolio/page.tsx` — master-detail page

**Files:**
- Create: `app/portfolio/page.tsx`

Composes `PortfolioSidebar` + `PortfolioActivityPanel` in a full-height master-detail layout.

**Step 1: Write the page**

```tsx
// app/portfolio/page.tsx
"use client";

import { useState } from "react";
import { PortfolioSidebar } from "@/components/portfolio/PortfolioSidebar";
import { PortfolioActivityPanel } from "@/components/portfolio/PortfolioActivityPanel";

export default function PortfolioPage() {
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      <PortfolioSidebar
        selected={selected?.symbol ?? null}
        onSelect={(symbol, name) => setSelected({ symbol, name })}
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        {selected ? (
          <PortfolioActivityPanel symbol={selected.symbol} name={selected.name} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl opacity-20">📊</span>
            <p
              className="text-[12px] font-mono"
              style={{ color: "#6B7280" }}
            >
              Select a symbol from your portfolio to view activity
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 3: Commit**
```bash
git add app/portfolio/page.tsx
git commit -m "feat(portfolio): /portfolio page — master-detail layout"
```

---

## Task 7: Add Portfolio to sidebar navigation

**Files:**
- Modify: `components/layout/Sidebar.tsx`

**Step 1: Add import**

At the top of `Sidebar.tsx`, the import line reads:
```ts
import {
  LayoutDashboard,
  Newspaper,
  ...
  ChevronRight,
} from "lucide-react";
```

Add `Briefcase` to the import list.

**Step 2: Add NAV entry**

In the `NAV` array, add after the Dashboard entry (first position to make it prominent):
```ts
{ href: "/portfolio", icon: Briefcase, label: "Portfolio" },
```

Or add it after `{ href: "/links", ... }` at the end — place it wherever feels natural in the navigation order. Recommended: after Dashboard.

**Step 3: TypeScript check**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 4: Commit**
```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(portfolio): add Portfolio entry to sidebar nav"
```

---

## Task 8: End-to-end smoke test

**Step 1: Start dev server**
```bash
cd "D:/Sunidhi-Intranet-Futuristic" && npm run dev
```

**Step 2: Test the flow**
1. Navigate to `http://localhost:3001/portfolio`
2. Type "REL" in the add-symbol search → dropdown should show RELIANCE at top
3. Select RELIANCE → spinner appears briefly → RELIANCE added to list, auto-selected
4. Verify 3 columns load with content or "No new activity detected"
5. Type "HDFCBANK" → add → select → verify fresh activity loads
6. Try typing "RECN12" → should NOT appear (no digits regex in nse-symbols API)
7. Try a gibberish symbol like "XXXXXX" → should show "not found on NSE" error, not be added

**Step 3: Verify no TypeScript errors**
```bash
npx tsc --noEmit --project "D:/Sunidhi-Intranet-Futuristic/tsconfig.json"
```

**Step 4: Final commit if any fixes were needed**
```bash
git add -p
git commit -m "fix(portfolio): smoke test fixes"
```
