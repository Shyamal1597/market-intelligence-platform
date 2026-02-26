# Sunidhi Research Intelligence Platform — Phase 1 Design

**Date:** 2026-02-26
**Status:** Approved
**Stack:** Next.js 15 + TypeScript + Tailwind CSS

---

## Overview

An internal research intranet for Sunidhi Capital's research team. Open access (no auth). Built on the same stack as `sunidhi-nextjs` so the market news system can be ported directly.

**Phase 1 Scope:**
1. Dashboard (home page)
2. Market News (ported + restyled)
3. Macro Command Centre (live market data)
4. BSE Filing Monitor (live regulatory filings)
5. Quick Links Hub

---

## Aesthetic Direction

**"Bloomberg Terminal × Financial Times Editorial"**

Dense with information, visually commanding, unmistakably financial. Editorial weight with terminal precision.

### Color Palette (CSS Variables)
```css
--bg-base:       #0C0E14   /* deep charcoal, grain texture overlay */
--bg-surface:    #13151E   /* card surfaces */
--bg-border:     #1E2235   /* 1px card borders */
--accent-amber:  #E8A020   /* primary accent — highlights, active states */
--accent-teal:   #00C9A7   /* positive/up indicators */
--accent-red:    #E84040   /* negative/down indicators */
--text-primary:  #F0EDE8   /* warm off-white */
--text-muted:    #6B7280
```

### Typography
- **Display/Headlines:** `Cormorant Garamond` (old-money editorial feel)
- **Numbers/Tickers:** `JetBrains Mono` (terminal precision)
- **Body/UI:** `DM Sans`

### Layout Shell
- Fixed left sidebar: 64px collapsed / 220px expanded, icon + label navigation
- Top bar: company logo + live clock + market status badge (Open/Closed/Pre-Open)
- **Ticker strip** pinned below top bar: Nifty, Sensex, Bank Nifty, Crude, Gold, USD/INR — colour-coded green/red
- Main content area: right of sidebar, below ticker strip

---

## Pages

### 1. Dashboard (Home — `/`)
3-column asymmetric grid:
- **Left (wide):** Top 5 latest news headlines — editorial list, large `Cormorant Garamond` text, source + timestamp, no images
- **Centre:** Macro tiles (Nifty, Sensex, Bank Nifty, Crude, Gold) as terminal-style readouts with animated number transitions
- **Right (narrow):** Live BSE filing feed (compact, colour-coded by type) + market status
- **Below the fold:** Quick Links in a 4-column magazine grid

### 2. Market News (`/news`)
Editorial newspaper layout (replaces uniform card grid):
- Top story: full-width banner, large headline typography only (no image)
- Row 2: 2 equal stories side by side
- Below: dense compact list — title + source + time only
- Source filter tabs styled as newspaper section tabs
- Search with live results count and debounce (300ms)
- Auto-fetches fresh RSS every 30 min, re-renders every 10 min

**APIs ported from `sunidhi-nextjs`:**
- `GET /api/market-news` — serve stored news (JSON file)
- `GET /api/fetch-market-news` — pull from RSS feeds + VCCircle
- `POST /api/market-news` — receive from n8n webhook (optional)

**Data sources:** Mint, Economic Times, The Hindu, ToI, MarketWatch, CNBC, Financial Times, Reuters sitemap, VCCircle

### 3. Macro Command Centre (`/macro`)
Full terminal dashboard:
- **Top row:** 6 large metric tiles — Nifty 50, Sensex, Bank Nifty, Brent Crude, Gold (MCX), USD/INR
  - Each tile: current value + change + % change + mini sparkline (Recharts LineChart)
  - Pulse animation on tile border when value updates
- **Middle row (3 cols):**
  - India Macro: RBI Repo Rate, CPI, IIP
  - Global: US 10Y Yield, DXY, CBOE VIX
  - FII/DII: Net FII flows, Net DII flows (from NSE data)
- **Data source:** Yahoo Finance unofficial API (`https://query1.finance.yahoo.com/v8/finance/chart/^NSEI`)
- **Refresh:** Every 60 seconds, silent background poll

### 4. BSE Filing Monitor (`/filings`)
- Two-column: live feed (60%) + category sidebar (40%)
- "LIVE" pulsing red dot in header
- Each entry: company name (large Cormorant), filing type badge (colour-coded), timestamp, description
- **Badge colours by filing type:**
  - Board Meeting / Outcome → Blue `#3B82F6`
  - Insider/Promoter Trade → Amber `#E8A020`
  - Financial Results → Green `#00C9A7`
  - DRHP/Prospectus → Purple `#8B5CF6`
  - General → Grey
- New entries slide in from top with 800ms highlight flash
- Auto-polls BSE XML feed every 2 minutes
- **Data source:** `https://www.bseindia.com/xml-data/corpfiling/AcceptedXML/` (public)

### 5. Quick Links Hub (`/links`)
- Editorial magazine grid, NOT a boring list
- Section dividers: `NSE/BSE`, `SEBI & Regulatory`, `Research Tools`, `Data & Screeners`, `Global Markets`
- Each link card: favicon, name, one-line description
- Hover: card lifts + amber left-border accent animates in
- Links stored in a static `data/quick-links.ts` config file (easy to add/remove)

---

## Project Structure

```
D:/Sunidhi Intranet/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (sidebar + topbar + ticker)
│   │   ├── page.tsx            # Dashboard
│   │   ├── news/
│   │   │   └── page.tsx        # Market News
│   │   ├── macro/
│   │   │   └── page.tsx        # Macro Command Centre
│   │   ├── filings/
│   │   │   └── page.tsx        # BSE Filing Monitor
│   │   ├── links/
│   │   │   └── page.tsx        # Quick Links Hub
│   │   └── api/
│   │       ├── market-news/
│   │       │   └── route.ts    # Serve stored news
│   │       ├── fetch-market-news/
│   │       │   └── route.ts    # Pull from RSS feeds
│   │       ├── macro/
│   │       │   └── route.ts    # Yahoo Finance proxy
│   │       └── filings/
│   │           └── route.ts    # BSE feed proxy + parser
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── TickerStrip.tsx
│   │   ├── dashboard/
│   │   │   ├── NewsHeadlines.tsx
│   │   │   ├── MacroTiles.tsx
│   │   │   └── FilingsFeed.tsx
│   │   ├── macro/
│   │   │   ├── MetricTile.tsx
│   │   │   └── Sparkline.tsx
│   │   ├── filings/
│   │   │   └── FilingEntry.tsx
│   │   └── ui/
│   │       └── Badge.tsx
│   └── lib/
│       ├── yahoo-finance.ts    # Yahoo Finance fetcher
│       ├── bse-filings.ts      # BSE XML parser
│       └── market-status.ts   # NSE market hours util
├── data/
│   ├── market-news.json        # Persisted news store
│   └── quick-links.ts          # Static quick links config
├── public/
│   └── grain.png               # Subtle noise texture
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Data Sources & APIs

| Data | Source | Auth Required | Cost |
|---|---|---|---|
| Nifty/Sensex/BankNifty | Yahoo Finance (`^NSEI`, `^BSESN`, `^NSEBANK`) | None | Free |
| Crude Oil | Yahoo Finance (`BZ=F`) | None | Free |
| Gold | Yahoo Finance (`GC=F`) | None | Free |
| USD/INR | Yahoo Finance (`INR=X`) | None | Free |
| Market News | RSS feeds (Mint, ET, Hindu etc.) | None | Free |
| BSE Filings | BSE India public XML | None | Free |
| RBI Rate | Static / manual update | None | Free |

---

## Dependencies to Add

```json
{
  "recharts": "^2.x",        // sparkline charts
  "rss-parser": "^3.x",     // already in sunidhi-nextjs
  "cheerio": "^1.x",        // already in sunidhi-nextjs
  "fast-xml-parser": "^4.x" // BSE XML parsing
}
```

Fonts via Google Fonts CDN (no install needed):
- `Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400`
- `JetBrains+Mono:wght@400;500`
- `DM+Sans:wght@400;500;600`

---

## Non-Goals (Phase 1)

- No authentication
- No user accounts or personalization
- No database — JSON file storage only
- No email alerts (Phase 4)
- No AI features (Phase 3)
