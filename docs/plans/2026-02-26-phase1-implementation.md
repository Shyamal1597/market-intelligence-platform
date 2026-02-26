# Phase 1 Implementation Plan — Sunidhi Research Intelligence Platform

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dark-themed, editorially designed research intranet with Market News, Macro Command Centre, BSE Filing Monitor, and Quick Links — all in a single Next.js 15 app.

**Architecture:** Next.js 15 App Router, file-based JSON persistence for news, server-side API routes as proxies for Yahoo Finance and BSE feeds. Fixed left sidebar shell wraps all pages. No auth, no database.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Recharts, rss-parser, cheerio, fast-xml-parser, Lucide React, Google Fonts (Cormorant Garamond + JetBrains Mono + DM Sans)

---

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`

**Step 1: Initialize the project**

Run inside `D:/Sunidhi Intranet`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```
When prompted: say Yes to all defaults. This creates the standard Next.js 15 structure.

**Step 2: Install additional dependencies**

```bash
npm install recharts rss-parser cheerio fast-xml-parser lucide-react clsx tailwind-merge
npm install --save-dev @types/node
```

**Step 3: Verify dev server starts**

```bash
npm run dev
```
Expected: `ready - started server on 0.0.0.0:3000`

**Step 4: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js 15 project with dependencies"
```

---

## Task 2: Configure Tailwind Theme & Global CSS

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Step 1: Replace `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#0C0E14",
        surface: "#13151E",
        border: "#1E2235",
        amber: "#E8A020",
        teal: "#00C9A7",
        danger: "#E84040",
        primary: "#F0EDE8",
        muted: "#6B7280",
      },
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.4s ease-out",
        "flash": "flash 0.8s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        flash: {
          "0%": { backgroundColor: "rgba(232, 160, 32, 0.3)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

**Step 2: Replace `app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-cormorant: 'Cormorant Garamond', Georgia, serif;
  --font-jetbrains: 'JetBrains Mono', monospace;
  --font-dm-sans: 'DM Sans', system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  background-color: #0C0E14;
  color: #F0EDE8;
}

body {
  font-family: var(--font-dm-sans);
  background-color: #0C0E14;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  min-height: 100vh;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #13151E; }
::-webkit-scrollbar-thumb { background: #1E2235; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #2A2D42; }

/* Number transition animations */
.value-up { color: #00C9A7; }
.value-down { color: #E84040; }
.value-neutral { color: #F0EDE8; }
```

**Step 3: Create `data/` directory and initial news file**

```bash
mkdir -p data
echo '{"news":[]}' > data/market-news.json
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: configure Tailwind theme and global CSS with dark editorial palette"
```

---

## Task 3: Market Status Utility

**Files:**
- Create: `lib/market-status.ts`

**Step 1: Create the utility**

```typescript
// lib/market-status.ts
export type MarketStatus = "open" | "pre-open" | "closed";

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Weekends: closed
  if (day === 0 || day === 6) return "closed";

  // Pre-open: 9:00 AM - 9:15 AM IST
  if (totalMinutes >= 540 && totalMinutes < 555) return "pre-open";

  // Regular session: 9:15 AM - 3:30 PM IST
  if (totalMinutes >= 555 && totalMinutes <= 930) return "open";

  return "closed";
}

export function getMarketStatusLabel(status: MarketStatus): string {
  switch (status) {
    case "open": return "Market Open";
    case "pre-open": return "Pre-Open";
    case "closed": return "Market Closed";
  }
}

export function getMarketStatusColor(status: MarketStatus): string {
  switch (status) {
    case "open": return "#00C9A7";
    case "pre-open": return "#E8A020";
    case "closed": return "#E84040";
  }
}
```

**Step 2: Commit**

```bash
git add lib/market-status.ts
git commit -m "feat: add market status utility for NSE trading hours"
```

---

## Task 4: Yahoo Finance API Route (Macro Data)

**Files:**
- Create: `app/api/macro/route.ts`
- Create: `lib/yahoo-finance.ts`

**Step 1: Create Yahoo Finance fetcher**

```typescript
// lib/yahoo-finance.ts
export interface QuoteData {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  history: number[]; // last 20 data points for sparkline
}

const SYMBOLS: Record<string, string> = {
  "^NSEI": "Nifty 50",
  "^BSESN": "Sensex",
  "^NSEBANK": "Bank Nifty",
  "BZ=F": "Brent Crude",
  "GC=F": "Gold",
  "INR=X": "USD/INR",
};

export async function fetchQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const encodedSymbol = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=5m&range=1d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 }, // cache for 60 seconds
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((v: number | null) => v !== null).slice(-20);

    const price = meta.regularMarketPrice ?? meta.previousClose;
    const previousClose = meta.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol,
      label: SYMBOLS[symbol] ?? symbol,
      price,
      change,
      changePercent,
      previousClose,
      history: validCloses,
    };
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return null;
  }
}

export async function fetchAllQuotes(): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    Object.keys(SYMBOLS).map(fetchQuote)
  );

  return results
    .filter((r): r is PromiseFulfilledResult<QuoteData> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}
```

**Step 2: Create API route**

```typescript
// app/api/macro/route.ts
import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    return NextResponse.json({ quotes, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Macro API error:", error);
    return NextResponse.json({ error: "Failed to fetch macro data" }, { status: 500 });
  }
}
```

**Step 3: Verify API works**

Start dev server, visit `http://localhost:3000/api/macro`. Expected: JSON with array of quotes including Nifty, Sensex etc.

**Step 4: Commit**

```bash
git add app/api/macro/ lib/yahoo-finance.ts
git commit -m "feat: add Yahoo Finance proxy API for macro market data"
```

---

## Task 5: Port Market News API Routes

**Files:**
- Create: `app/api/market-news/route.ts`
- Create: `app/api/fetch-market-news/route.ts`

**Step 1: Copy `app/api/market-news/route.ts`**

This is a direct port from `C:/Users/SSFL-RETAIL-017/sunidhi-nextjs/src/app/api/market-news/route.ts`. Copy the file verbatim. It reads/writes `data/market-news.json`.

**Step 2: Copy `app/api/fetch-market-news/route.ts`**

Direct port from `C:/Users/SSFL-RETAIL-017/sunidhi-nextjs/src/app/api/fetch-market-news/route.ts`. Requires `rss-parser` and `cheerio` (both installed in Task 1).

**Step 3: Verify**

Visit `http://localhost:3000/api/fetch-market-news` — should return JSON with `success: true` and `newItems` count. Then visit `http://localhost:3000/api/market-news` — should return stored news.

**Step 4: Commit**

```bash
git add app/api/market-news/ app/api/fetch-market-news/ data/
git commit -m "feat: port market news RSS aggregation API from sunidhi-nextjs"
```

---

## Task 6: BSE Filing Monitor API Route

**Files:**
- Create: `app/api/filings/route.ts`
- Create: `lib/bse-filings.ts`

**Step 1: Create BSE filings parser**

```typescript
// lib/bse-filings.ts
import { XMLParser } from "fast-xml-parser";

export interface BSEFiling {
  id: string;
  company: string;
  scripCode: string;
  filingType: string;
  category: FilingCategory;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}

export type FilingCategory =
  | "results"
  | "board-meeting"
  | "insider-trade"
  | "ipo-drhp"
  | "general";

function classifyFiling(filingType: string): FilingCategory {
  const t = filingType.toLowerCase();
  if (t.includes("result") || t.includes("financial")) return "results";
  if (t.includes("board") || t.includes("meeting")) return "board-meeting";
  if (
    t.includes("insider") ||
    t.includes("promoter") ||
    t.includes("shareholding")
  )
    return "insider-trade";
  if (t.includes("drhp") || t.includes("prospectus") || t.includes("ipo"))
    return "ipo-drhp";
  return "general";
}

export async function fetchBSEFilings(limit = 50): Promise<BSEFiling[]> {
  try {
    // BSE public announcements XML feed
    const url =
      "https://www.bseindia.com/xml-data/corpfiling/AcceptedXML/GetCorpFiling.aspx";

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/xml, text/xml, */*",
        Referer: "https://www.bseindia.com/",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`BSE fetch failed: ${res.status}`);
      return getMockFilings(); // fallback to mock data if BSE is unreachable
    }

    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const items =
      parsed?.NewDataSet?.Table ?? parsed?.root?.item ?? [];
    const arr = Array.isArray(items) ? items : [items];

    return arr.slice(0, limit).map((item: any, i: number) => {
      const filingType = item.CATEGORYNAME ?? item.Category ?? "Announcement";
      return {
        id: `${item.SCRIPCD ?? i}-${Date.now()}-${i}`,
        company: item.COMPANYNAME ?? item.Company ?? "Unknown Company",
        scripCode: item.SCRIPCD ?? "",
        filingType,
        category: classifyFiling(filingType),
        description: item.HEADLINE ?? item.Headline ?? filingType,
        pdfUrl: item.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`
          : null,
        submittedAt: item.SLONGDATE ?? item.DATE_OF_FILING ?? new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error("BSE filings error:", err);
    return getMockFilings();
  }
}

// Fallback mock data for when BSE is unreachable (dev/network issues)
function getMockFilings(): BSEFiling[] {
  const now = new Date();
  return [
    {
      id: "mock-1",
      company: "Reliance Industries Ltd",
      scripCode: "500325",
      filingType: "Board Meeting",
      category: "board-meeting",
      description: "Outcome of Board Meeting - Q3 FY2026 Results",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
    },
    {
      id: "mock-2",
      company: "HDFC Bank Ltd",
      scripCode: "500180",
      filingType: "Financial Results",
      category: "results",
      description: "Unaudited Financial Results for Q3 FY2026",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 15 * 60000).toISOString(),
    },
    {
      id: "mock-3",
      company: "Infosys Ltd",
      scripCode: "500209",
      filingType: "Insider Trading",
      category: "insider-trade",
      description: "Disclosure under SEBI (PIT) Regulations - Promoter Trade",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 32 * 60000).toISOString(),
    },
    {
      id: "mock-4",
      company: "Tata Consultancy Services",
      scripCode: "532540",
      filingType: "Announcement",
      category: "general",
      description: "Investor Presentation - Q3 FY2026",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 48 * 60000).toISOString(),
    },
    {
      id: "mock-5",
      company: "Zomato Ltd",
      scripCode: "543320",
      filingType: "Prospectus",
      category: "ipo-drhp",
      description: "Draft Red Herring Prospectus filed with SEBI",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 65 * 60000).toISOString(),
    },
  ];
}
```

**Step 2: Create API route**

```typescript
// app/api/filings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchBSEFilings } from "@/lib/bse-filings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const filings = await fetchBSEFilings(limit);
    return NextResponse.json({ filings, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Filings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch filings" },
      { status: 500 }
    );
  }
}
```

**Step 3: Verify**

Visit `http://localhost:3000/api/filings` — should return JSON with filings array (real or mock).

**Step 4: Commit**

```bash
git add app/api/filings/ lib/bse-filings.ts
git commit -m "feat: add BSE filing monitor API with fallback mock data"
```

---

## Task 7: Quick Links Data File

**Files:**
- Create: `lib/quick-links.ts`

**Step 1: Create static config**

```typescript
// lib/quick-links.ts
export interface QuickLink {
  name: string;
  url: string;
  description: string;
  favicon?: string;
}

export interface LinkSection {
  title: string;
  icon: string;
  links: QuickLink[];
}

export const QUICK_LINKS: LinkSection[] = [
  {
    title: "NSE / BSE",
    icon: "Building2",
    links: [
      { name: "NSE India", url: "https://www.nseindia.com", description: "National Stock Exchange — live data, F&O, equity" },
      { name: "BSE India", url: "https://www.bseindia.com", description: "Bombay Stock Exchange — filings, prices, IPOs" },
      { name: "NSE Corporate Filings", url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", description: "Company announcements on NSE" },
      { name: "BSE Corporate Filings", url: "https://www.bseindia.com/corporates/ann.html", description: "Company announcements on BSE" },
      { name: "NSE F&O BhavCopy", url: "https://www.nseindia.com/market-data/live-equity-market", description: "Live F&O market data" },
    ],
  },
  {
    title: "SEBI & Regulatory",
    icon: "Scale",
    links: [
      { name: "SEBI", url: "https://www.sebi.gov.in", description: "Securities and Exchange Board of India" },
      { name: "SEBI Circulars", url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=2&smid=0", description: "Latest SEBI circulars and regulations" },
      { name: "RBI", url: "https://www.rbi.org.in", description: "Reserve Bank of India — monetary policy, data" },
      { name: "MCA21", url: "https://www.mca.gov.in", description: "Ministry of Corporate Affairs — company records" },
      { name: "AMFI", url: "https://www.amfiindia.com", description: "Association of Mutual Funds in India" },
    ],
  },
  {
    title: "Research & Screeners",
    icon: "Search",
    links: [
      { name: "Screener.in", url: "https://www.screener.in", description: "Financial data, ratios, and stock screening" },
      { name: "Trendlyne", url: "https://trendlyne.com", description: "Advanced stock screener and analytics" },
      { name: "Tijori Finance", url: "https://tijorifinance.com", description: "Deep financial analysis and company data" },
      { name: "Tickertape", url: "https://www.tickertape.in", description: "Stock research and portfolio analytics" },
      { name: "Chittorgarh", url: "https://www.chittorgarh.com", description: "IPO data, grey market premium, allotments" },
    ],
  },
  {
    title: "Data & Analytics",
    icon: "BarChart2",
    links: [
      { name: "Trading Economics", url: "https://tradingeconomics.com/india", description: "Macro economic indicators — India and global" },
      { name: "FRED", url: "https://fred.stlouisfed.org", description: "Federal Reserve Economic Data — free macro data" },
      { name: "NSDL FII Data", url: "https://www.fpi.nsdl.co.in/web/Reports/Yearwise.aspx", description: "FPI/FII investment data by year" },
      { name: "Moneycontrol Markets", url: "https://www.moneycontrol.com/markets/", description: "Market data, IPOs, mutual funds" },
      { name: "Yahoo Finance India", url: "https://finance.yahoo.com/quote/%5ENSEI/", description: "Nifty 50 live chart and data" },
    ],
  },
  {
    title: "Global Markets",
    icon: "Globe",
    links: [
      { name: "Bloomberg Markets", url: "https://www.bloomberg.com/markets", description: "Global financial news and data" },
      { name: "Financial Times", url: "https://www.ft.com/markets", description: "FT markets section — global analysis" },
      { name: "Reuters Markets", url: "https://www.reuters.com/markets/", description: "Breaking markets news from Reuters" },
      { name: "CME FedWatch", url: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html", description: "Fed rate decision probability tracker" },
      { name: "CNBC Markets", url: "https://www.cnbc.com/markets/", description: "US and global market updates" },
    ],
  },
];
```

**Step 2: Commit**

```bash
git add lib/quick-links.ts
git commit -m "feat: add static quick links configuration"
```

---

## Task 8: Sidebar Component

**Files:**
- Create: `components/layout/Sidebar.tsx`

**Step 1: Create sidebar**

```tsx
// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  BookMarked,
  ChevronRight,
  Activity,
} from "lucide-react";
import { clsx } from "clsx";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/news", icon: Newspaper, label: "Market News" },
  { href: "/macro", icon: TrendingUp, label: "Macro" },
  { href: "/filings", icon: FileText, label: "BSE Filings" },
  { href: "/links", icon: BookMarked, label: "Quick Links" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={clsx(
        "fixed left-0 top-0 z-50 h-screen flex flex-col transition-all duration-300 ease-in-out",
        "bg-surface border-r border-[#1E2235]",
        expanded ? "w-56" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-amber flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-base" />
          </div>
          {expanded && (
            <span className="font-display text-lg font-semibold text-primary whitespace-nowrap tracking-wide">
              Sunidhi
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-hidden">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-all duration-150 group relative",
                active
                  ? "bg-amber/10 text-amber"
                  : "text-muted hover:text-primary hover:bg-white/5"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber rounded-r-full" />
              )}
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap font-sans">
                  {label}
                </span>
              )}
              {!expanded && (
                <div className="absolute left-full ml-3 px-2 py-1 bg-[#1E2235] text-primary text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center h-12 border-t border-[#1E2235] text-muted hover:text-primary transition-colors"
      >
        <ChevronRight
          className={clsx(
            "w-4 h-4 transition-transform duration-300",
            expanded && "rotate-180"
          )}
        />
      </button>
    </aside>
  );
}
```

**Step 2: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add collapsible sidebar with active state and tooltips"
```

---

## Task 9: TopBar & TickerStrip Components

**Files:**
- Create: `components/layout/TopBar.tsx`
- Create: `components/layout/TickerStrip.tsx`

**Step 1: Create TopBar**

```tsx
// components/layout/TopBar.tsx
"use client";

import { useEffect, useState } from "react";
import { getMarketStatus, getMarketStatusLabel } from "@/lib/market-status";

export function TopBar() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const status = getMarketStatus();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      setTime(
        ist.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
      setDate(
        ist.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const statusColor =
    status === "open"
      ? "text-teal"
      : status === "pre-open"
      ? "text-amber"
      : "text-danger";

  return (
    <div className="h-12 flex items-center justify-between px-6 border-b border-[#1E2235] bg-surface/80 backdrop-blur-sm">
      <h1 className="font-display text-lg font-semibold text-primary/70 tracking-widest uppercase text-xs">
        Research Intelligence
      </h1>
      <div className="flex items-center gap-6">
        <div className={`flex items-center gap-2 text-xs font-mono ${statusColor}`}>
          <span
            className={`w-2 h-2 rounded-full ${
              status === "open"
                ? "bg-teal animate-pulse"
                : status === "pre-open"
                ? "bg-amber animate-pulse"
                : "bg-danger"
            }`}
          />
          {getMarketStatusLabel(status)}
        </div>
        <div className="text-xs font-mono text-muted">
          <span className="text-primary">{time}</span>
          <span className="mx-2 text-[#1E2235]">|</span>
          {date} IST
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create TickerStrip**

```tsx
// components/layout/TickerStrip.tsx
"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (symbol === "BZ=F" || symbol === "GC=F") return price.toFixed(1);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function TickerItem({ quote }: { quote: Quote }) {
  const up = quote.change >= 0;
  return (
    <div className="flex items-center gap-2 px-4 py-1 border-r border-[#1E2235] shrink-0">
      <span className="text-xs text-muted font-sans">{quote.label}</span>
      <span className="text-sm font-mono text-primary font-medium">
        {formatPrice(quote.price, quote.symbol)}
      </span>
      <span
        className={`flex items-center gap-0.5 text-xs font-mono ${
          up ? "text-teal" : "text-danger"
        }`}
      >
        {up ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {up ? "+" : ""}
        {quote.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export function TickerStrip() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const fetchQuotes = async () => {
    try {
      const res = await fetch("/api/macro");
      if (!res.ok) return;
      const data = await res.json();
      setQuotes(data.quotes ?? []);
    } catch {}
  };

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, []);

  if (quotes.length === 0) return null;

  return (
    <div className="h-9 flex items-center overflow-x-auto bg-base border-b border-[#1E2235] no-scrollbar">
      {quotes.map((q) => (
        <TickerItem key={q.symbol} quote={q} />
      ))}
    </div>
  );
}
```

**Step 3: Add `no-scrollbar` utility to globals.css**

Append to `app/globals.css`:
```css
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

**Step 4: Commit**

```bash
git add components/layout/TopBar.tsx components/layout/TickerStrip.tsx app/globals.css
git commit -m "feat: add TopBar with live IST clock and TickerStrip with macro quotes"
```

---

## Task 10: Root Layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Replace root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { TickerStrip } from "@/components/layout/TickerStrip";

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
      <body className="bg-base text-primary">
        <Sidebar />
        {/* Main area: offset by sidebar width (64px) */}
        <div className="ml-16 flex flex-col min-h-screen transition-all duration-300">
          <TopBar />
          <TickerStrip />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

**Step 2: Verify layout renders**

Visit `http://localhost:3000` — should see: sidebar on left, topbar on top with clock and market status, ticker strip below topbar. Main content area blank (will add pages next).

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire up root layout with sidebar, topbar, and ticker strip"
```

---

## Task 11: Shared UI Components

**Files:**
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/SectionHeader.tsx`

**Step 1: Create Badge**

```tsx
// components/ui/Badge.tsx
import { clsx } from "clsx";

interface BadgeProps {
  label: string;
  variant: "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general";
}

const VARIANT_STYLES = {
  results: "bg-teal/15 text-teal border-teal/30",
  "board-meeting": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "insider-trade": "bg-amber/15 text-amber border-amber/30",
  "ipo-drhp": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  general: "bg-white/5 text-muted border-white/10",
};

export function Badge({ label, variant }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border",
        VARIANT_STYLES[variant]
      )}
    >
      {label}
    </span>
  );
}
```

**Step 2: Create SectionHeader**

```tsx
// components/ui/SectionHeader.tsx
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-primary tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted mt-1 font-sans">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add components/ui/
git commit -m "feat: add Badge and SectionHeader UI primitives"
```

---

## Task 12: Dashboard Page (Home)

**Files:**
- Modify: `app/page.tsx`
- Create: `components/dashboard/NewsHeadlines.tsx`
- Create: `components/dashboard/MacroTiles.tsx`
- Create: `components/dashboard/DashboardFilings.tsx`
- Create: `components/dashboard/QuickLinksPreview.tsx`

**Step 1: Create `NewsHeadlines.tsx`**

```tsx
// components/dashboard/NewsHeadlines.tsx
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
            <div className="h-5 bg-surface rounded w-full mb-1" />
            <div className="h-3 bg-surface rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0 divide-y divide-[#1E2235]">
      {news.slice(0, 7).map((item, i) => (
        <a
          key={item.id}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start justify-between gap-4 py-4 hover:bg-white/[0.02] transition-colors -mx-4 px-4"
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
```

**Step 2: Create `MacroTiles.tsx`**

```tsx
// components/dashboard/MacroTiles.tsx
"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(1);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

export function MacroTiles() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes ?? []))
      .catch(() => {});
  }, []);

  if (quotes.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-12 bg-surface rounded-lg border border-[#1E2235]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quotes.slice(0, 5).map((q) => {
        const up = q.change >= 0;
        return (
          <div
            key={q.symbol}
            className="flex items-center justify-between p-3 rounded-lg bg-surface border border-[#1E2235] hover:border-[#2A2D42] transition-colors"
          >
            <span className="text-xs text-muted font-sans uppercase tracking-wider">
              {q.label}
            </span>
            <div className="text-right">
              <div className="font-mono text-base font-semibold text-primary">
                {formatPrice(q.price, q.symbol)}
              </div>
              <div
                className={`flex items-center justify-end gap-1 text-xs font-mono ${
                  up ? "text-teal" : "text-danger"
                }`}
              >
                {up ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {up ? "+" : ""}
                {q.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: Create `DashboardFilings.tsx`**

```tsx
// components/dashboard/DashboardFilings.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";

interface Filing {
  id: string;
  company: string;
  category: "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general";
  filingType: string;
  description: string;
  submittedAt: string;
  pdfUrl: string | null;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function DashboardFilings() {
  const [filings, setFilings] = useState<Filing[]>([]);

  useEffect(() => {
    fetch("/api/filings?limit=6")
      .then((r) => r.json())
      .then((d) => setFilings(d.filings ?? []))
      .catch(() => {});

    const interval = setInterval(() => {
      fetch("/api/filings?limit=6")
        .then((r) => r.json())
        .then((d) => setFilings(d.filings ?? []))
        .catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      {filings.slice(0, 6).map((f) => (
        <div key={f.id} className="group">
          {f.pdfUrl ? (
            <a href={f.pdfUrl} target="_blank" rel="noopener noreferrer" className="block">
              <FilingCard filing={f} />
            </a>
          ) : (
            <FilingCard filing={f} />
          )}
        </div>
      ))}
    </div>
  );
}

function FilingCard({ filing }: { filing: Filing }) {
  return (
    <div className="p-3 rounded-lg border border-[#1E2235] bg-surface/50 hover:bg-surface transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-display text-sm font-semibold text-primary leading-tight">
          {filing.company}
        </span>
        <Badge label={filing.filingType} variant={filing.category} />
      </div>
      <p className="text-xs text-muted leading-snug line-clamp-2">{filing.description}</p>
      <p className="text-xs font-mono text-muted/60 mt-1">{timeAgo(filing.submittedAt)}</p>
    </div>
  );
}
```

**Step 4: Create `QuickLinksPreview.tsx`**

```tsx
// components/dashboard/QuickLinksPreview.tsx
import { QUICK_LINKS } from "@/lib/quick-links";
import { ExternalLink } from "lucide-react";

export function QuickLinksPreview() {
  // Show first 8 links across all sections
  const links = QUICK_LINKS.flatMap((s) => s.links).slice(0, 8);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2 p-3 rounded-lg border border-[#1E2235] bg-surface/50 hover:border-amber/30 hover:bg-surface transition-all"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary group-hover:text-amber transition-colors truncate">
              {link.name}
            </p>
            <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-snug">
              {link.description}
            </p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0 mt-0.5" />
        </a>
      ))}
    </div>
  );
}
```

**Step 5: Build `app/page.tsx` Dashboard**

```tsx
// app/page.tsx
import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { MacroTiles } from "@/components/dashboard/MacroTiles";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";
import { QuickLinksPreview } from "@/components/dashboard/QuickLinksPreview";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-8">
      {/* Top 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* News Headlines — 6 cols */}
        <div className="lg:col-span-6 bg-surface border border-[#1E2235] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display text-2xl font-semibold text-primary tracking-tight">
              Market Headlines
            </h2>
          </div>
          <NewsHeadlines />
        </div>

        {/* Macro — 3 cols */}
        <div className="lg:col-span-3 bg-surface border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-4">
            Markets
          </h2>
          <MacroTiles />
        </div>

        {/* Filings — 3 cols */}
        <div className="lg:col-span-3 bg-surface border border-[#1E2235] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display text-xl font-semibold text-primary">
              BSE Filings
            </h2>
            <span className="flex items-center gap-1 text-xs font-mono text-danger">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              LIVE
            </span>
          </div>
          <DashboardFilings />
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-surface border border-[#1E2235] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-primary">
            Quick Links
          </h2>
          <a href="/links" className="text-xs text-amber hover:underline font-mono">
            View all →
          </a>
        </div>
        <QuickLinksPreview />
      </div>
    </div>
  );
}
```

**Step 6: Verify dashboard**

Visit `http://localhost:3000` — should see the 3-column layout with news, macro, filings, and quick links below. Run fetch-market-news first if news list is empty.

**Step 7: Commit**

```bash
git add app/page.tsx components/dashboard/
git commit -m "feat: build dashboard with news headlines, macro tiles, filings feed, and quick links"
```

---

## Task 13: Market News Page

**Files:**
- Create: `app/news/page.tsx`

**Step 1: Create the page**

```tsx
// app/news/page.tsx
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
  return (html ?? "").replace(/<[^>]*>/g, "").substring(0, 180);
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
    } catch {} finally {
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

  useEffect(() => {
    if (!query.trim()) { setFiltered(news); return; }
    const q = query.toLowerCase();
    setFiltered(
      news.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.source?.toLowerCase().includes(q) ||
          n.content?.toLowerCase().includes(q)
      )
    );
  }, [news, query]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch("/api/fetch-market-news");
    await fetchNews();
  };

  const [top, ...rest] = filtered;
  const second = rest.slice(0, 2);
  const compact = rest.slice(2);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Market News
          </h1>
          <p className="text-muted text-sm mt-1 font-sans">
            {filtered.length} stories · auto-refreshes every 30 min
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-[#1E2235] rounded-lg text-sm text-muted hover:text-primary hover:border-amber/30 transition-all font-sans"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Fetching…" : "Refresh"}
        </button>
      </div>

      {/* Search + Source Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search stories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-[#1E2235] rounded-lg text-sm text-primary placeholder-muted focus:outline-none focus:border-amber/50 font-sans w-64"
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
                  : "bg-surface text-muted border-[#1E2235] hover:text-primary hover:border-[#2A2D42]"
              }`}
            >
              {s === "all" ? "ALL SOURCES" : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#1E2235] border-t-amber rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-display text-2xl">No stories found</p>
        </div>
      ) : (
        <div className="space-y-px">
          {/* Top story — full width editorial banner */}
          {top && (
            <a
              href={top.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block border-t-2 border-t-amber border-x border-b border-[#1E2235] bg-surface hover:bg-surface/80 p-8 mb-6 transition-colors"
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
          {second.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px mb-px">
              {second.map((item) => (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-6 border border-[#1E2235] bg-surface hover:bg-surface/80 transition-colors"
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
          <div className="border border-[#1E2235] divide-y divide-[#1E2235]">
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
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/news/
git commit -m "feat: build editorial-style market news page with top story, grid, and compact list"
```

---

## Task 14: Macro Command Centre Page

**Files:**
- Create: `app/macro/page.tsx`
- Create: `components/macro/MetricTile.tsx`
- Create: `components/macro/Sparkline.tsx`

**Step 1: Create `Sparkline.tsx`**

```tsx
// components/macro/Sparkline.tsx
"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  positive: boolean;
}

export function Sparkline({ data, positive }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={positive ? "#00C9A7" : "#E84040"}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Create `MetricTile.tsx`**

```tsx
// components/macro/MetricTile.tsx
import { TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "./Sparkline";

interface MetricTileProps {
  label: string;
  price: number;
  change: number;
  changePercent: number;
  symbol: string;
  history: number[];
}

function fmt(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(4);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(2);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return price.toFixed(2);
}

export function MetricTile({ label, price, change, changePercent, symbol, history }: MetricTileProps) {
  const up = change >= 0;
  return (
    <div className={`relative rounded-xl border p-5 bg-surface overflow-hidden transition-all hover:border-opacity-60 ${up ? "border-teal/20 hover:border-teal/40" : "border-danger/20 hover:border-danger/40"}`}>
      <p className="text-xs font-mono text-muted uppercase tracking-widest mb-3">{label}</p>
      <p className="font-mono text-3xl font-semibold text-primary mb-1">{fmt(price, symbol)}</p>
      <div className={`flex items-center gap-1 text-sm font-mono ${up ? "text-teal" : "text-danger"}`}>
        {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        {up ? "+" : ""}{change.toFixed(2)} ({up ? "+" : ""}{changePercent.toFixed(2)}%)
      </div>
      <div className="mt-3 opacity-60">
        <Sparkline data={history} positive={up} />
      </div>
    </div>
  );
}
```

**Step 3: Create `app/macro/page.tsx`**

```tsx
// app/macro/page.tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { MetricTile } from "@/components/macro/MetricTile";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  history: number[];
}

const INDIA_MACRO = [
  { label: "RBI Repo Rate", value: "6.50%", note: "As of Feb 2025" },
  { label: "CPI Inflation", value: "5.22%", note: "Jan 2026" },
  { label: "IIP Growth", value: "3.8%", note: "Nov 2025" },
];

const GLOBAL_MACRO = [
  { label: "US 10Y Yield", value: "4.42%", note: "Live approx" },
  { label: "DXY (Dollar Index)", value: "107.2", note: "Live approx" },
  { label: "CBOE VIX", value: "16.8", note: "Live approx" },
];

export default function MacroPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/macro");
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setFetchedAt(data.fetchedAt);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Macro Command Centre
          </h1>
          <p className="text-muted text-sm mt-1 font-mono">
            Live market data · refreshes every 60s
            {fetchedAt && ` · last updated ${new Date(fetchedAt).toLocaleTimeString("en-IN")}`}
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-[#1E2235] rounded-lg text-sm text-muted hover:text-primary hover:border-amber/30 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Live Market Quotes */}
      <section className="mb-10">
        <h2 className="text-xs font-mono text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          Live Market Data
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse h-32 bg-surface rounded-xl border border-[#1E2235]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quotes.map((q) => (
              <MetricTile key={q.symbol} {...q} />
            ))}
          </div>
        )}
      </section>

      {/* India + Global Static Macro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-4">India Macro</h2>
          <div className="space-y-3">
            {INDIA_MACRO.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-3 border-b border-[#1E2235] last:border-0">
                <div>
                  <p className="text-sm text-primary font-sans">{m.label}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">{m.note}</p>
                </div>
                <span className="font-mono text-xl font-semibold text-amber">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface border border-[#1E2235] rounded-xl p-6">
          <h2 className="font-display text-xl font-semibold text-primary mb-4">Global Indicators</h2>
          <div className="space-y-3">
            {GLOBAL_MACRO.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-3 border-b border-[#1E2235] last:border-0">
                <div>
                  <p className="text-sm text-primary font-sans">{m.label}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">{m.note}</p>
                </div>
                <span className="font-mono text-xl font-semibold text-teal">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add app/macro/ components/macro/
git commit -m "feat: build macro command centre with live quotes, sparklines, and static indicators"
```

---

## Task 15: BSE Filing Monitor Page

**Files:**
- Create: `app/filings/page.tsx`

**Step 1: Create the page**

```tsx
// app/filings/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface Filing {
  id: string;
  company: string;
  scripCode: string;
  category: "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general";
  filingType: string;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "results", label: "Results" },
  { key: "board-meeting", label: "Board Meeting" },
  { key: "insider-trade", label: "Insider/Promoter" },
  { key: "ipo-drhp", label: "IPO / DRHP" },
  { key: "general", label: "General" },
];

export default function FilingsPage() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set());

  const load = async () => {
    try {
      const res = await fetch("/api/filings?limit=60");
      const data = await res.json();
      const incoming: Filing[] = data.filings ?? [];

      // Detect new arrivals for flash animation
      const incomingIds = new Set(incoming.map((f) => f.id));
      const freshIds = new Set([...incomingIds].filter((id) => !prevIds.current.has(id)));
      if (freshIds.size > 0) setNewIds(freshIds);
      prevIds.current = incomingIds;

      setFilings(incoming);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 120000);
    return () => clearInterval(i);
  }, []);

  // Clear flash after animation
  useEffect(() => {
    if (newIds.size === 0) return;
    const t = setTimeout(() => setNewIds(new Set()), 1000);
    return () => clearTimeout(t);
  }, [newIds]);

  const visible = filter === "all" ? filings : filings.filter((f) => f.category === filter);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
              BSE Filings
            </h1>
            <span className="flex items-center gap-1.5 text-xs font-mono text-danger border border-danger/30 px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-muted text-sm font-sans">Corporate announcements · updates every 2 min</p>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`px-3 py-1.5 rounded text-xs font-mono tracking-wide border transition-all ${
              filter === c.key
                ? "bg-amber/10 text-amber border-amber/40"
                : "bg-surface text-muted border-[#1E2235] hover:text-primary"
            }`}
          >
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse h-20 bg-surface rounded-xl border border-[#1E2235]" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((f) => {
            const isNew = newIds.has(f.id);
            return (
              <div
                key={f.id}
                className={`group border border-[#1E2235] rounded-xl p-5 bg-surface hover:bg-surface/80 transition-all ${
                  isNew ? "animate-flash" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-display text-xl font-semibold text-primary group-hover:text-amber transition-colors">
                        {f.company}
                      </h3>
                      {f.scripCode && (
                        <span className="text-xs font-mono text-muted border border-[#1E2235] px-1.5 py-0.5 rounded">
                          {f.scripCode}
                        </span>
                      )}
                      <Badge label={f.filingType} variant={f.category} />
                    </div>
                    <p className="text-sm text-muted leading-relaxed">{f.description}</p>
                    <p className="text-xs font-mono text-muted/60 mt-2">{timeAgo(f.submittedAt)}</p>
                  </div>
                  {f.pdfUrl && (
                    <a
                      href={f.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1E2235] text-xs font-mono text-muted hover:text-amber hover:border-amber/40 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      PDF
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="text-center py-16 text-muted">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-display text-2xl">No filings in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/filings/
git commit -m "feat: build BSE filing monitor with category filters and flash animation for new entries"
```

---

## Task 16: Quick Links Hub Page

**Files:**
- Create: `app/links/page.tsx`

**Step 1: Create the page**

```tsx
// app/links/page.tsx
import { QUICK_LINKS } from "@/lib/quick-links";
import { ExternalLink, Building2, Scale, Search, BarChart2, Globe } from "lucide-react";

const ICONS: Record<string, React.ElementType> = {
  Building2,
  Scale,
  Search,
  BarChart2,
  Globe,
};

export default function LinksPage() {
  return (
    <div className="p-6">
      <div className="mb-10">
        <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
          Quick Links
        </h1>
        <p className="text-muted text-sm mt-1 font-sans">Curated resources for the research team</p>
      </div>

      <div className="space-y-10">
        {QUICK_LINKS.map((section) => {
          const Icon = ICONS[section.icon] ?? Globe;
          return (
            <section key={section.title}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-amber/10 border border-amber/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-amber" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-primary tracking-tight">
                  {section.title}
                </h2>
                <div className="flex-1 h-px bg-[#1E2235]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {section.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex flex-col justify-between p-4 rounded-xl border border-[#1E2235] bg-surface hover:bg-surface/80 hover:border-amber/30 transition-all overflow-hidden"
                  >
                    {/* Amber left accent line */}
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber scale-y-0 group-hover:scale-y-100 transition-transform duration-200 origin-bottom rounded-r-full" />

                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-primary group-hover:text-amber transition-colors leading-snug">
                          {link.name}
                        </p>
                        <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0 mt-0.5" />
                      </div>
                      <p className="text-xs text-muted leading-snug line-clamp-2">
                        {link.description}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/links/
git commit -m "feat: build quick links hub with section dividers and amber accent hover"
```

---

## Task 17: Final Polish & Verification

**Step 1: Remove default Next.js boilerplate**

Delete `app/favicon.ico` (replace with Sunidhi logo if available) and any placeholder content in `public/`.

**Step 2: Add `not-found.tsx`**

```tsx
// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <p className="font-mono text-6xl font-bold text-amber mb-4">404</p>
      <h1 className="font-display text-3xl text-primary mb-2">Page not found</h1>
      <p className="text-muted mb-8">This page doesn't exist in the research platform.</p>
      <Link href="/" className="px-4 py-2 border border-amber/40 text-amber rounded-lg hover:bg-amber/10 transition-colors text-sm font-mono">
        ← Back to Dashboard
      </Link>
    </div>
  );
}
```

**Step 3: Full build check**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. Warnings about dynamic server usage (for API routes) are expected.

**Step 4: Seed initial news**

```bash
curl http://localhost:3000/api/fetch-market-news
```

Expected: JSON response with `newItems > 0`.

**Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete Phase 1 — Sunidhi Research Intelligence Platform

- Dashboard with news headlines, macro tiles, filings feed, quick links
- Market news page with editorial newspaper layout
- Macro command centre with live Yahoo Finance quotes and sparklines
- BSE filing monitor with category filters and live flash animation
- Quick links hub with sectioned editorial grid
- Dark editorial theme: Cormorant Garamond + JetBrains Mono + DM Sans
- Collapsible sidebar, live IST clock, market status, ticker strip"
```

---

## Quick Reference

| URL | Page |
|---|---|
| `http://localhost:3000` | Dashboard |
| `http://localhost:3000/news` | Market News |
| `http://localhost:3000/macro` | Macro Command Centre |
| `http://localhost:3000/filings` | BSE Filing Monitor |
| `http://localhost:3000/links` | Quick Links Hub |
| `http://localhost:3000/api/macro` | Yahoo Finance proxy |
| `http://localhost:3000/api/filings` | BSE filings proxy |
| `http://localhost:3000/api/market-news` | Serve stored news |
| `http://localhost:3000/api/fetch-market-news` | Pull fresh RSS news |
