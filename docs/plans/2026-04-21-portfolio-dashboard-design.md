# Portfolio Dashboard — Design Doc
**Date:** 2026-04-21  
**Status:** Approved

## Overview

A dedicated `/portfolio` page where any user can maintain a personal watchlist (per-browser, localStorage) and view company-specific activity across three live data streams: Market News, NSE Filings, and Bulk/Block/Short Selling Deals.

---

## Decisions

| Question | Decision |
|---|---|
| Separate from existing watchlist? | Yes — independent portfolio |
| Storage | `localStorage` key `portfolio_v1` — no server changes |
| Layout | Master-detail: sidebar (stock list) + main panel (3 columns) |
| Add stock UX | NSE symbol autocomplete (`/api/nse-symbols`) + quote validation |
| Main panel layout | 3 equal columns side-by-side: News \| Filings \| Deals |
| News filtering | Symbol-specific only, title-only matching via `getSearchTerms()` |

---

## Architecture

```
app/portfolio/page.tsx
app/api/portfolio/[symbol]/activity/route.ts
components/portfolio/
  PortfolioSidebar.tsx
  PortfolioActivityPanel.tsx
  ActivityColumn.tsx
```

---

## Data Model

```ts
// localStorage: portfolio_v1
interface PortfolioEntry {
  symbol: string;   // e.g. "RELIANCE"
  name: string;     // e.g. "Reliance Industries Limited"
  addedAt: string;  // ISO date string
}
```

---

## API: `/api/portfolio/[symbol]/activity`

Runs three fetches in `Promise.all`, returns one payload:

```ts
interface ActivityResponse {
  symbol: string;
  news:     { items: NewsItem[];    fetchedAt: string };
  filings:  { items: FilingItem[];  fetchedAt: string };
  deals:    { items: DealItem[];    fetchedAt: string };
}
```

### Stream 1 — News
- Source: `data/market-news.json`
- Filter: `getSearchTerms(symbol)` from `lib/smart-money.ts` (suffix-stripping: RECLTD→["RECLTD","REC"])
- Match: title-only (avoids false positives from article body)
- Limit: 15, sorted newest first

### Stream 2 — Filings
- Source: `fetchNSEFilings(500)` from `lib/nse-filings.ts`
- Filter: `filing.scripCode === symbol`
- Limit: 20

### Stream 3 — Deals
- Source: `fetchBulkDeals()` + `fetchBlockDeals()` + `fetchShortDeals()` in parallel
- Filter: symbol match on each deal's symbol/scrip field
- Combined, sorted by date
- Limit: 20

**Empty state:** Each stream returns `items: []` when nothing found — UI shows "No new activity detected."

---

## Validation Flow (Add Stock)

1. User types in sidebar search → debounced fetch to `/api/nse-symbols?q=X`
2. Autocomplete dropdown shows results (NIFTY500 priority, no-digits regex)
3. User selects a symbol
4. Client calls `/api/quote/[symbol]` — if it returns a valid price, add to localStorage
5. If quote fails → show inline error "Symbol not found on NSE" — do not add

This double-gates entry: autocomplete regex blocks bond codes, quote verification blocks any remaining non-equity symbols.

---

## Page Layout

```
┌──────────────┬──────────────────────────────────────────────┐
│ PORTFOLIO    │  RELIANCE INDUSTRIES        ₹1,234  +1.2%   │
│              │  ──────────────────────────────────────────  │
│ [+ Add]      │  MARKET NEWS  │  NSE FILINGS  │  DEALS      │
│              │               │               │             │
│ ▶ RELIANCE   │  • Article 1  │  • Filing 1   │  • Deal 1   │
│   HDFCBANK   │  • Article 2  │  • Filing 2   │  No new     │
│   TCS        │  No new       │               │   activity  │
│              │   activity    │               │   detected  │
│              │   detected    │               │             │
└──────────────┴───────────────────────────────────────────────┘
```

- **Sidebar:** fixed `w-64`, add-symbol search at top, stock list below, remove button per entry
- **Main panel header:** stock name + live price from `/api/quote/[symbol]` (reused existing route)
- **3 columns:** equal width (`grid-cols-3`), each independently scrollable, sticky column header
- **Empty portfolio:** centered prompt to add first stock
- **No selection:** centered prompt to pick a stock from the list

---

## Navigation

Add `/portfolio` entry to the existing sidebar navigation (`components/layout/Sidebar.tsx`).

---

## Out of Scope

- Multi-portfolio support (single portfolio per browser)
- Export / share portfolio
- Price alerts
- Historical deal data beyond what NSE currently returns
