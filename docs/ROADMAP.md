# Market Intelligence Platform — Roadmap

**Project:** Internal Research Intranet
**Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · App Router
**Updated:** 2026-02-26

---

## Phase 1 — Core Research Platform ✅ COMPLETE

**Objective:** Five functional pages covering the full daily workflow of a research analyst.

### Pages Built

| Page | Route | Key Features |
|---|---|---|
| Dashboard | `/` | Live market metrics, news headlines, filings feed |
| Market News | `/news` | RSS aggregator, source filters, search, auto-refresh |
| Macro Command Centre | `/macro` | Live Yahoo Finance quotes, static macro indicators |
| Filings Monitor | `/filings` | Live corporate announcements, category filters, PDF links |
| Quick Links Hub | `/links` | Curated external links (NSE/BSE, SEBI, screeners, data) |

### Infrastructure

- **`GET /api/macro`** — Yahoo Finance proxy (`query1.finance.yahoo.com`), 20-day history, 60s cache
- **`GET /api/market-news`** — Serves stored `data/market-news.json` (up to 200 items)
- **`POST /api/fetch-market-news`** — RSS aggregator pulling from 9 sources (Mint, ET, Reuters, etc.)
- **`GET /api/filings`** — Live corporate filing feed (BSE originally, NSE RSS in Phase 3)
- **`data/market-news.json`** — File-based persistence, no database
- **Sidebar, TopBar** layout components with IST clock, market open/closed status

### Design System Established

- Background `#0C0E14` · Surface `#13151E` · Borders `#1E2235`
- Accent orange `#F5820D` (brand) · Teal `#00C9A7` · Danger `#E84040`
- Fonts: Cormorant Garamond (display) + JetBrains Mono (data) + DM Sans (body)
- Aesthetic: Bloomberg Terminal × Financial Times Editorial

---

## Phase 2 — Dashboard Redesign ✅ COMPLETE

**Objective:** Replace the generic dashboard with a professional, information-dense layout inspired by Koyfin — hero metrics row with sparklines, terminal-style section headers, brand identity.

**Design doc:** `docs/plans/2026-02-26-dashboard-redesign-design.md`
**Implementation plan:** `docs/plans/2026-02-26-dashboard-redesign.md`

### Changes Made

| # | File | Change |
|---|---|---|
| 1 | `app/globals.css` | Accent color `#E8A020` → `#F5820D` (brand orange) |
| 2 | `components/layout/Sidebar.tsx` | Replaced `Activity` Lucide icon with CSS `S` brand mark in `#CC1F37` |
| 3 | `app/layout.tsx` | Removed `<TickerStrip />` from global layout (file kept) |
| 4 | `components/dashboard/MetricsRow.tsx` | **NEW** — 5-tile hero row with sparklines, teal/danger left borders |
| 5 | `components/dashboard/NewsHeadlines.tsx` | Refactored to flat terminal rows with source abbreviation badges |
| 6 | `components/dashboard/DashboardFilings.tsx` | Refactored to flat rows with LIVE pulse dot, "Updated X ago" label |
| 7 | `app/page.tsx` | Rewritten: `MetricsRow` + 60/40 grid (news left, filings right) |

### Key Commits

```
2deaa4a  fix: stabilise load with useCallback
abcfe9a  docs: update accent amber
7c3eaa7  feat: redesign dashboard
09f0f2f  style: refactor DashboardFilings
f211c5f  style: refactor NewsHeadlines
fae34c3  feat: add MetricsRow
277bdf3  style: remove TickerStrip
e9d02b8  style: sidebar brand mark
af18a3a  chore: ignore .claude/
ebf9ee5  style: update accent color
```

---

## Phase 3 — Data & Brand Enhancement 🔄 IN PROGRESS

**Objective:** Replace unreliable BSE XML feed with NSE RSS feeds (always-accessible links), add logo, and update branding.

### Tasks

| # | Task | Status | File(s) |
|---|---|---|---|
| 3.1 | Replace BSE XML with NSE RSS feeds | ✅ Done | `lib/nse-filings.ts` (new), `app/api/filings/route.ts` |
| 3.2 | Add logo PNG to sidebar | ✅ Done | `public/images/logo.png`, `components/layout/Sidebar.tsx` |
| 3.3 | Update filings page header text (BSE → NSE) | 🔲 Todo | `app/filings/page.tsx` |
| 3.4 | Fix Sidebar nav label "BSE Filings" → "NSE Filings" | 🔲 Todo | `components/layout/Sidebar.tsx` |

### NSE RSS Feed Details

**Why NSE over BSE:**
The BSE XML feed's `ATTACHMENTNAME` field is unreliable — many entries lack it, producing `pdfUrl: null` for all filings. NSE RSS feeds provide a direct `link` field for every item (always accessible).

**Feeds used (`lib/nse-filings.ts`):**
```
Financial Results   https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml
Board Meetings      https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml
Insider Trading     https://nsearchives.nseindia.com/content/RSS/Insider_Trading.xml
Offer Documents     https://nsearchives.nseindia.com/content/RSS/Offer_Documents.xml
Announcements       https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml
Corporate Action    https://nsearchives.nseindia.com/content/RSS/Corporate_action.xml
```

**Title format:** NSE titles come as `"SYMBOL : Description"` — the lib parses both parts, populating `company` (symbol) and `description` separately.

**Parser:** `rss-parser@3.13.0` (already installed), fetched in parallel via `Promise.allSettled`.

---

## Phase 4 — Advanced Intelligence 🔲 PLANNED

**Objective:** Transform the platform from a passive display to an active intelligence tool — personalised alerts, AI-assisted research, and deeper market coverage.

### Proposed Features

#### 4.1 Watchlist & Alerts
- User-configurable stock watchlist (file-based JSON, no auth required)
- Browser notification when a filing appears for a watchlisted company
- Price threshold alerts via browser Notification API
- **Files:** `lib/watchlist.ts`, `data/watchlist.json`, new `/watchlist` page

#### 4.2 Earnings Calendar
- 30-day forward-looking calendar of result dates scraped from NSE
- Color-coded by sector; filter by index (Nifty 50, Nifty 100)
- Link to historical results filings inline
- **Files:** `app/calendar/page.tsx`, `lib/earnings-calendar.ts`, `app/api/calendar/route.ts`

#### 4.3 Sector Dashboard
- Sector heatmap (Nifty sector indices) with 1D / 5D / 1M toggle
- Top gainers / losers per sector
- Breadth indicator (advance/decline ratio)
- **Files:** `app/sectors/page.tsx`, `app/api/sectors/route.ts`

#### 4.4 AI Research Assistant
- Claude-powered research Q&A sidebar (⌘K or sidebar button)
- Context-aware: reads current page (filings, news, macro) and uses it as context
- Supports: "summarise today's filings", "what moved Nifty?", "explain this filing"
- **Files:** `components/ai/ResearchChat.tsx`, `app/api/ai/route.ts`
- **Dependency:** Anthropic SDK (`@anthropic-ai/sdk`)

#### 4.5 News Intelligence
- Automatic entity extraction (company → ticker mapping) from news headlines
- Link headlines directly to the relevant filing when a match exists
- Sentiment classification (positive/neutral/negative) per headline
- **Files:** Extend `lib/market-news.ts`, update `/news` page

---

## Architecture Notes

### Data Flow

```
External Sources                  API Layer                  UI
──────────────                    ─────────                  ──
Yahoo Finance ──────────────────► /api/macro ──────────────► MetricsRow, MacroTiles
NSE RSS Feeds ──────────────────► /api/filings ────────────► DashboardFilings, /filings
RSS News Feeds ─► data/market-news.json ─► /api/market-news ► NewsHeadlines, /news
(static)  ──────────────────────────────────────────────────► /links, /macro (static)
```

### Key Constraints

- **No auth, no database** — internal network only; file-based JSON persistence
- **No new dependencies without discussion** — bundle size matters
- **No changes to API shape** without updating all consumers
- **Server-side only** for all external fetches (Yahoo Finance blocks client-side)
- **NSE/BSE rate limits** — cache aggressively; default poll interval is 2 minutes

### File Naming Conventions

- Pages: `app/[route]/page.tsx`
- API routes: `app/api/[name]/route.ts`
- Data libs: `lib/[domain].ts` (e.g. `lib/nse-filings.ts`)
- Dashboard widgets: `components/dashboard/[Name].tsx`
- Shared UI: `components/ui/[Name].tsx`

---

## Non-Goals (All Phases)

- No user authentication or per-user data
- No real-time WebSocket connections
- No paid data subscriptions
- No mobile app / React Native
- No external database
- No email/SMS delivery
