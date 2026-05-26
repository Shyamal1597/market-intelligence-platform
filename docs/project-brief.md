# Market Intelligence Platform — Project Brief

## One-Liner
Real-time internal research intelligence platform for an equity research team, combining live market data, derivatives analytics, BSE filing monitoring, earnings transcript analysis, and portfolio coverage tracking into a single Bloomberg-style dark terminal interface.

## Role
Full-Stack Developer (Solo)

## Tech Stack
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts
- **Backend:** Next.js API Routes, Server-Side Rendering
- **Data Sources:** NSE India APIs, BSE XML Feeds, Yahoo Finance, ICICI Breeze API, RSS Feeds
- **Storage:** File-based JSON persistence, SQLite (reports), no external database
- **Tooling:** Cheerio (HTML parsing), fast-xml-parser, rss-parser

## Design System
Custom dark editorial theme inspired by Bloomberg Terminal and Financial Times — information-dense layouts, monospaced data typography (JetBrains Mono), serif display headings (Cormorant Garamond), SVG grain textures, and a dual light/dark theme system powered by CSS custom properties.

---

## Core Modules

### 1. Dashboard
Centralized landing page with market overview widgets, live ticker strip, macro indicators, and quick-access navigation to all modules.

### 2. Derivatives / Option Chain Terminal
- Live NSE option chain data with session cookie bootstrapping to bypass API restrictions
- Symmetric call/put table with OI bars, IV, LTP, change, bid/ask, volume, and full Greeks columns
- ITM strike highlighting with diagonal stripe pattern, ATM row auto-scroll
- Summary bar: Spot, ATM IV, PCR (color-coded by bullish/bearish threshold), Max Pain, Resistance/Support walls (peak OI strikes), Market Open/Closed status
- Aggregate metrics: Total OI and Total Volume (CE/PE split) with Cr/L/K formatting
- OI vs Volume bar mode toggle, configurable column visibility persisted to localStorage
- IV Skew visualization tab
- Auto-refresh polling (24s interval during market hours)

### 3. Management Guidance Tracker (Intel Dashboard)
AI-powered pipeline that tracks whether company management delivers on forward-looking promises made during earnings calls.

**5-Stage Pipeline:**
1. **Stage 1** — Excel fundamental data parsing (optional)
2. **Stage 2** — Earnings transcript ingestion (raw text from conference calls)
3. **Stage 3** — LLM-based claim extraction (structured claims with metric, direction, magnitude, target quarter)
4. **Stage 4** — Cross-checking claims against subsequent quarter transcripts (LLM-based verdict: met / moving / miss / pending / ambiguous)
5. **Stage 5** — Summary generation per quarter

**Frontend Features:**
- Company-level dashboard with segment cards (Banking, Insurance, Asset Management, etc.)
- Per-segment metric filtering (only metrics with actual claims shown)
- Quarter-by-quarter claim grid with verdict badges and drill-down detail view
- Self-referencing check detection (prevents verifying claims against the same transcript they came from)
- "Latest Guidance" section for forward-looking claims awaiting verification
- Sector registry mapping metrics to segments

### 4. BSE Filing Monitor
- Real-time BSE corporate filing feed via XML API proxy
- Filing type categorization with color-coded badges (Financial Results, Board Meeting, Insider Trading, AGM, etc.)
- Full-text search with company alias expansion (substring matching across ticker symbols and company names)
- Auto-refresh with new filing indicators

### 5. Coverage Intelligence
- Research team's coverage universe with analyst assignments
- Per-company metrics: latest rating, target price, report history timeline
- Price Target Walk chart (Recharts) tracking target price evolution against market price
- ICICI Breeze API integration for live/historical OHLC price data
- Fallback logic: skips "Note"-type reports (no rating/TP) and surfaces the most recent substantive report

### 6. Per-Stock Research Pages
- Dynamic `/research/[symbol]` routes
- Company header with live price data
- Quarterly results panel with financial metrics
- Shareholding pattern tracking
- Integrated with Breeze API for historical price charts

### 7. Macro Command Centre
- Yahoo Finance proxy for macro indicators
- Metric tiles with sparkline charts
- Key economic indicators at a glance

### 8. Market News Aggregator
- Multi-source RSS feed aggregation (ET Markets, Moneycontrol, LiveMint, etc.)
- Server-side fetch and JSON persistence (up to 200 items)
- Category filtering and search

### 9. RAG PDF Report Viewer
- SQLite-backed report metadata storage
- PDF upload and management
- Report search and filtering by analyst, company, date

---

## Technical Highlights

- **Zero external database dependency** — all data persisted as JSON files or SQLite, designed for air-gapped internal network deployment
- **NSE API session management** — cookie bootstrapping with browser-mimicking headers to authenticate against NSE's anti-bot measures
- **Dual theme system** — CSS custom properties injected via ThemeProvider, all components use semantic Tailwind classes (`bg-surface`, `text-primary`) ensuring both dark and light themes work without hardcoded colors
- **Real-time data** — polling-based auto-refresh with configurable intervals (30s during market hours, 5min after close)
- **LLM integration** — Anthropic Claude API for earnings transcript claim extraction and cross-verification pipeline
- **Max Pain calculation** — standard options max pain algorithm iterating all strikes and computing total writer loss at each level
- **Information density** — designed for professional use on large monitors; every pixel serves a purpose with no decorative whitespace

---

## Scale
- Internal tool serving a ~15-person equity research team
- Covers 50+ stocks across banking, insurance, asset management, and financial services sectors
- Processes earnings transcripts and generates structured claim data for multi-quarter tracking
