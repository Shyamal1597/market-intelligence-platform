# Phase 4 — Network, Ticker, Commodities, Logo, News Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Five improvements — LAN network access, 10s ticker refresh, Gold/Silver INR tiles, real Sunidhi logo, and expanded news feeds.

**Architecture:** All changes are isolated to individual files. Backend commodity calculation in `lib/yahoo-finance.ts`. Frontend tile count in `MetricsRow.tsx`. Logo PNG already in `/public/images/`. News feeds added to the existing RSS array. No new dependencies required.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Recharts, rss-parser, cheerio, Windows netsh for firewall

---

## Task 1: Open LAN Access via Windows Firewall

**Files:**
- No code changes — Windows firewall CLI only

**Step 1: Add inbound firewall rule**

Run in terminal (as Administrator if needed):
```bash
netsh advfirewall firewall add rule name="Sunidhi Intranet Port 3001" dir=in action=allow protocol=TCP localport=3001
```

Expected output: `Ok.`

**Step 2: Verify rule was created**

```bash
netsh advfirewall firewall show rule name="Sunidhi Intranet Port 3001"
```

Expected: Shows rule with `Enabled: Yes`, `Direction: In`, `Action: Allow`

**Step 3: Confirm server is accessible on LAN IP**

```bash
curl http://192.168.48.102:3001
```

Expected: Returns HTML (the dashboard page). If timeout, check Windows Defender Firewall — the netsh rule may need the Windows Defender Firewall profile to match (Domain/Private/Public). Add `profile=any` if needed:
```bash
netsh advfirewall firewall add rule name="Sunidhi Intranet Port 3001" dir=in action=allow protocol=TCP localport=3001 profile=any
```

**Tell the user:** Their colleagues can access the platform at `http://192.168.48.102:3001`

---

## Task 2: Ticker 10-Second Refresh

**Files:**
- Modify: `components/layout/TickerStrip.tsx` (line 62)

**Step 1: Change the interval**

In `TickerStrip.tsx`, find:
```tsx
const interval = setInterval(fetchQuotes, 60000);
```

Replace with:
```tsx
const interval = setInterval(fetchQuotes, 10000);
```

**Step 2: Verify**

Rebuild and restart:
```bash
npm run build && npm start -- -p 3001
```

Open the dashboard. Watch the ticker strip — values should visibly update every 10 seconds when market is open. The backend `/api/macro` is cached by Next.js for 60s so Yahoo Finance won't be hammered.

**Step 3: Commit**

```bash
git add components/layout/TickerStrip.tsx
git commit -m "feat: update ticker strip refresh interval to 10 seconds"
```

---

## Task 3: Add Silver Symbol to Yahoo Finance Fetcher

**Files:**
- Modify: `lib/yahoo-finance.ts`

**Step 1: Add SI=F to SYMBOLS map**

In `lib/yahoo-finance.ts`, find the `SYMBOLS` object:
```ts
const SYMBOLS: Record<string, string> = {
  "^NSEI": "Nifty 50",
  "^BSESN": "Sensex",
  "^NSEBANK": "Bank Nifty",
  "BZ=F": "Brent Crude",
  "GC=F": "Gold",
  "INR=X": "USD/INR",
};
```

Replace with:
```ts
const SYMBOLS: Record<string, string> = {
  "^NSEI": "Nifty 50",
  "^BSESN": "Sensex",
  "^NSEBANK": "Bank Nifty",
  "BZ=F": "Brent Crude",
  "GC=F": "Gold",
  "SI=F": "Silver",
  "INR=X": "USD/INR",
};
```

**Step 2: Add INR conversion logic to `fetchAllQuotes`**

Find the current `fetchAllQuotes` function:
```ts
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

Replace with:
```ts
// Troy ounce conversion factors
const TROY_OZ_PER_10G = 10 / 31.1035;
const TROY_OZ_PER_KG  = 1000 / 31.1035;

export async function fetchAllQuotes(): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    Object.keys(SYMBOLS).map(fetchQuote)
  );

  const quotes = results
    .filter((r): r is PromiseFulfilledResult<QuoteData | null> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((v): v is QuoteData => v !== null);

  // Find gold, silver (USD/oz) and INR rate for conversion
  const gold   = quotes.find((q) => q.symbol === "GC=F");
  const silver = quotes.find((q) => q.symbol === "SI=F");
  const inrRate = quotes.find((q) => q.symbol === "INR=X");

  const derived: QuoteData[] = [];

  if (gold && inrRate) {
    const convertPrice = (usdOz: number) => usdOz * inrRate.price * TROY_OZ_PER_10G;
    const goldInrPrice = convertPrice(gold.price);
    const goldInrPrev  = convertPrice(gold.previousClose);
    const goldInrChange = goldInrPrice - goldInrPrev;
    derived.push({
      symbol: "GOLD_INR",
      label: "Gold ₹/10g",
      price: goldInrPrice,
      change: goldInrChange,
      changePercent: (goldInrChange / goldInrPrev) * 100,
      previousClose: goldInrPrev,
      history: (gold.history ?? []).map((h) => h * inrRate.price * TROY_OZ_PER_10G),
    });
  }

  if (silver && inrRate) {
    const convertPrice = (usdOz: number) => usdOz * inrRate.price * TROY_OZ_PER_KG;
    const silverInrPrice = convertPrice(silver.price);
    const silverInrPrev  = convertPrice(silver.previousClose);
    const silverInrChange = silverInrPrice - silverInrPrev;
    derived.push({
      symbol: "SILVER_INR",
      label: "Silver ₹/kg",
      price: silverInrPrice,
      change: silverInrChange,
      changePercent: (silverInrChange / silverInrPrev) * 100,
      previousClose: silverInrPrev,
      history: (silver.history ?? []).map((h) => h * inrRate.price * TROY_OZ_PER_KG),
    });
  }

  return [...quotes, ...derived];
}
```

**Step 3: Verify backend returns new symbols**

```bash
npm run build
curl http://localhost:3001/api/macro
```

Expected: JSON with `quotes` array containing entries with `symbol: "GOLD_INR"` and `symbol: "SILVER_INR"` with prices like `~78000` (Gold ₹/10g) and `~90000` (Silver ₹/kg).

**Step 4: Commit**

```bash
git add lib/yahoo-finance.ts
git commit -m "feat: add Silver and INR-denominated Gold/Silver quotes to macro API"
```

---

## Task 4: Show Gold ₹ and Silver ₹ in MetricsRow

**Files:**
- Modify: `components/dashboard/MetricsRow.tsx`

**Step 1: Update `formatPrice` to handle INR symbols**

In `MetricsRow.tsx`, find:
```ts
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(1);
  if (price > 10000)
    return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}
```

Replace with:
```ts
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F", "SI=F"].includes(symbol)) return price.toFixed(1);
  if (["GOLD_INR", "SILVER_INR"].includes(symbol))
    return "₹" + Math.round(price).toLocaleString("en-IN");
  if (price > 10000)
    return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}
```

**Step 2: Expand tile count and grid**

Find:
```tsx
const tiles = loading
  ? Array.from({ length: 5 })
  : quotes.slice(0, 5);
```

Replace with:
```tsx
const tiles = loading
  ? Array.from({ length: 7 })
  : quotes.slice(0, 7);
```

Find:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
```

Replace with:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
```

**Step 3: Verify dashboard shows 7 tiles including Gold ₹ and Silver ₹**

```bash
npm run build && npm start -- -p 3001
```

Open `http://localhost:3001`. MetricsRow should show 7 tiles: Nifty 50, Sensex, Bank Nifty, Brent Crude, Gold (USD), Gold ₹/10g, Silver ₹/kg.

**Step 4: Commit**

```bash
git add components/dashboard/MetricsRow.tsx
git commit -m "feat: display Gold INR and Silver INR as dashboard metric tiles"
```

---

## Task 5: Update TickerStrip formatPrice for INR symbols

**Files:**
- Modify: `components/layout/TickerStrip.tsx`

**Step 1: Update `formatPrice`**

In `TickerStrip.tsx`, find:
```ts
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (symbol === "BZ=F" || symbol === "GC=F") return price.toFixed(1);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}
```

Replace with:
```ts
function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["BZ=F", "GC=F", "SI=F"].includes(symbol)) return price.toFixed(1);
  if (["GOLD_INR", "SILVER_INR"].includes(symbol))
    return "₹" + Math.round(price).toLocaleString("en-IN");
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return price.toFixed(2);
}
```

**Note:** No rebuild needed yet — combine with Task 6 commit.

---

## Task 6: Replace Sidebar Logo

**Files:**
- Modify: `components/layout/Sidebar.tsx` (lines 37–59)

**Step 1: Replace the red "S" badge in collapsed state**

Find the Logo section:
```tsx
{/* Logo */}
<div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
  <div className="flex items-center gap-3 overflow-hidden">
    {/* Collapsed: Sunidhi brand mark — red square with S initial */}
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 select-none"
      style={{ backgroundColor: "#CC1F37" }}
    >
      <span className="font-display font-bold text-white text-base leading-none">
        S
      </span>
    </div>
    {/* Expanded: actual Sunidhi logo on white background pill */}
    {expanded && (
      <div className="bg-white rounded-md px-2.5 py-1 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/Sunidhi_logo_homepage.png"
          alt="Sunidhi Securities & Finance"
          className="h-7 w-auto object-contain"
        />
      </div>
    )}
  </div>
</div>
```

Replace with:
```tsx
{/* Logo */}
<div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
  <div className="flex items-center gap-3 overflow-hidden">
    {/* Collapsed: actual Sunidhi logo at small size */}
    {!expanded && (
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 select-none p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/Sunidhi_logo_homepage.png"
          alt="Sunidhi"
          className="w-full h-full object-contain"
        />
      </div>
    )}
    {/* Expanded: actual Sunidhi logo on white background pill */}
    {expanded && (
      <div className="bg-white rounded-md px-2.5 py-1 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/Sunidhi_logo_homepage.png"
          alt="Sunidhi Securities & Finance"
          className="h-7 w-auto object-contain"
        />
      </div>
    )}
  </div>
</div>
```

**Step 2: Rebuild and verify**

```bash
npm run build && npm start -- -p 3001
```

Open the dashboard. The sidebar collapsed state should show the Sunidhi logo on a white rounded square instead of the red "S". Click the expand arrow — expanded logo should remain unchanged.

**Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/TickerStrip.tsx
git commit -m "feat: replace sidebar S badge with actual Sunidhi logo; update ticker INR formatting"
```

---

## Task 7: Add New News RSS Feeds + Source Detection

**Files:**
- Modify: `app/api/fetch-market-news/route.ts`

**Step 1: Expand the RSS_FEEDS array**

Find:
```ts
const RSS_FEEDS = [
  "https://www.livemint.com/rss/companies",
  "https://www.livemint.com/rss/markets",
  "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  "http://www.thehindu.com/business/?service=rss",
  "http://timesofindia.indiatimes.com/rssfeeds/1898055.cms",
  "https://www.marketwatch.com/rss/topstories",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.ft.com/markets",
  "https://www.ft.com/companies",
  // Business Standard RSS feeds are blocked by their server
  // Alternative: Using additional ET and Mint feeds for better coverage
  "https://www.livemint.com/rss/industry",
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
];
```

Replace with:
```ts
const RSS_FEEDS = [
  // --- Livemint ---
  "https://www.livemint.com/rss/companies",
  "https://www.livemint.com/rss/markets",
  "https://www.livemint.com/rss/industry",
  // --- Economic Times ---
  "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  // --- Moneycontrol ---
  "https://www.moneycontrol.com/rss/marketreports.xml",
  "https://www.moneycontrol.com/rss/business.xml",
  // --- NDTV Profit ---
  "https://www.ndtv.com/business/rss",
  // --- BQ Prime (Bloomberg India) ---
  "https://www.bqprime.com/feeds/rss",
  // --- Business Standard ---
  "https://www.business-standard.com/rss/latest.rss",
  // --- The Hindu / Times of India ---
  "http://www.thehindu.com/business/?service=rss",
  "http://timesofindia.indiatimes.com/rssfeeds/1898055.cms",
  // --- Global ---
  "https://www.marketwatch.com/rss/topstories",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.ft.com/markets",
  "https://www.ft.com/companies",
];
```

**Step 2: Add new sources to `detectSource()`**

Find the `detectSource` function body. Add these entries BEFORE the final `return "Unknown"`:
```ts
if (hostname.includes("moneycontrol.com")) return "Moneycontrol";
if (hostname.includes("ndtv.com")) return "NDTV Profit";
if (hostname.includes("bqprime.com")) return "BQ Prime";
if (hostname.includes("business-standard.com")) return "Business Standard";
```

**Step 3: Add badge styles for new sources in `NewsHeadlines.tsx`**

**File:** `components/dashboard/NewsHeadlines.tsx`

Find `SOURCE_BADGE_STYLE`:
```ts
const SOURCE_BADGE_STYLE: Record<string, string> = {
  MC: "text-orange-400 bg-orange-500/10 border border-orange-500/20",
  ET: "text-sky-400 bg-sky-500/10 border border-sky-500/20",
  BS: "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20",
  MINT: "text-teal bg-teal/10 border border-teal/25",
  FT: "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  NDTV: "text-rose-400 bg-rose-500/10 border border-rose-500/20",
  BBG: "text-violet-400 bg-violet-500/10 border border-violet-500/20",
  CNBC: "text-blue-400 bg-blue-500/10 border border-blue-500/20",
  REU: "text-slate-400 bg-white/[0.05] border border-white/10",
};
```

Replace with (source abbreviations match the `source` field from `detectSource()`):
```ts
const SOURCE_BADGE_STYLE: Record<string, string> = {
  // Indian sources
  Moneycontrol:       "text-orange-400 bg-orange-500/10 border border-orange-500/20",
  "Economic Times":   "text-sky-400 bg-sky-500/10 border border-sky-500/20",
  "Business Standard":"text-cyan-400 bg-cyan-500/10 border border-cyan-500/20",
  Mint:               "text-teal bg-teal/10 border border-teal/25",
  "NDTV Profit":      "text-rose-400 bg-rose-500/10 border border-rose-500/20",
  "BQ Prime":         "text-violet-400 bg-violet-500/10 border border-violet-500/20",
  VCCircle:           "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  "The Hindu":        "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20",
  "Times of India":   "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20",
  // Global
  Reuters:            "text-slate-400 bg-white/[0.05] border border-white/10",
  "Financial Times":  "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  CNBC:               "text-blue-400 bg-blue-500/10 border border-blue-500/20",
  MarketWatch:        "text-green-400 bg-green-500/10 border border-green-500/20",
};

/** Get badge style — full source name key, falls back to a neutral style */
function getBadgeStyle(source: string): string {
  return SOURCE_BADGE_STYLE[source]
    ?? "text-muted bg-white/[0.03] border border-white/10";
}
```

**Step 4: Update badge rendering in NewsHeadlines**

In the same file, find where the source badge is rendered. It currently uses abbreviations like `VCC`, `MINT`, etc. Now the source field is the full name from `detectSource()`. Find the badge render — look for something like:

```tsx
<span className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded ...`}>
  {/* abbreviated source */}
</span>
```

The badge should now use:
1. `getBadgeStyle(item.source ?? "")` for the className
2. A short abbreviation derived from the source name for the label

Add this abbreviation helper above the component:
```ts
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

function getSourceAbbrev(source: string): string {
  return SOURCE_ABBREV[source] ?? source.substring(0, 4).toUpperCase();
}
```

Then update the badge JSX to use `getBadgeStyle` and `getSourceAbbrev`.

**Step 5: Rebuild and trigger a news fetch**

```bash
npm run build && npm start -- -p 3001
```

Then in browser or curl, trigger the fetch:
```bash
curl http://localhost:3001/api/fetch-market-news
```

Expected response: JSON with `newItems > 0`, `sourceDistribution` showing Moneycontrol, NDTV Profit, BQ Prime etc.

**Step 6: Commit**

```bash
git add app/api/fetch-market-news/route.ts components/dashboard/NewsHeadlines.tsx
git commit -m "feat: expand news feeds with Moneycontrol, NDTV Profit, BQ Prime, Business Standard"
```

---

## Task 8: Auto-Populate News Store on Cold Start

**Files:**
- Modify: `app/api/market-news/route.ts`

**Step 1: Add a cold-start trigger**

The news store is only populated when `/api/fetch-market-news` is manually hit. When the store is nearly empty, the dashboard looks bare. Fix: if fewer than 50 items, silently trigger a background fetch.

Read the current `app/api/market-news/route.ts`. It should look like:
```ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // ... reads market-news.json and returns it
}
```

At the top of the GET handler, after reading the JSON file, add:
```ts
// Auto-populate if store is nearly empty
if (newsData.news.length < 50) {
  // Fire-and-forget fetch — don't await so response isn't blocked
  fetch(`${request.nextUrl.origin}/api/fetch-market-news`).catch(() => {});
}
```

This fires a background refresh whenever someone hits the news API with a nearly-empty store, without blocking the response.

**Step 2: Verify**

Delete the news store to simulate cold start:
```bash
echo '{"news":[]}' > "D:\Sunidhi Intranet\data\market-news.json"
```

Restart server. Open dashboard. After ~10-30 seconds, the news feed should start populating automatically.

**Step 3: Commit**

```bash
git add app/api/market-news/route.ts
git commit -m "feat: auto-trigger news fetch when store has fewer than 50 items"
```

---

## Task 9: Final Build + End-to-End Verification

**Step 1: Full rebuild**

```bash
cd "D:\Sunidhi Intranet"
npm run build && npm start -- -p 3001
```

**Step 2: Verify each feature**

| Check | Expected |
|-------|----------|
| Open `http://localhost:3001` | Dashboard loads |
| MetricsRow | 7 tiles — last two show "Gold ₹/10g" and "Silver ₹/kg" with ₹-prefixed prices |
| Ticker strip | Updates every 10 seconds; Gold ₹ and Silver ₹ visible in the strip |
| Sidebar collapsed | Shows Sunidhi PNG logo on white square (no red "S") |
| Sidebar expanded | Logo visible in white pill (unchanged) |
| Open `http://192.168.48.102:3001` | Same dashboard — accessible from LAN |
| News page | Multiple sources visible: Moneycontrol, NDTV Profit, ET, BQ Prime, etc. |

**Step 3: Commit design doc**

```bash
git add docs/plans/
git commit -m "docs: add Phase 4 design and implementation plan"
```

---

## Quick Reference — All Files Changed

| File | What Changed |
|------|-------------|
| `lib/yahoo-finance.ts` | Added SI=F; added GOLD_INR + SILVER_INR computed quotes |
| `components/dashboard/MetricsRow.tsx` | slice(0,7), grid-cols-7, ₹ formatPrice |
| `components/layout/TickerStrip.tsx` | 10s interval; ₹ formatPrice |
| `components/layout/Sidebar.tsx` | PNG logo in collapsed state |
| `app/api/fetch-market-news/route.ts` | 5 new RSS feeds + source detection |
| `components/dashboard/NewsHeadlines.tsx` | Full-name source keys + new badge styles |
| `app/api/market-news/route.ts` | Auto-populate trigger |
