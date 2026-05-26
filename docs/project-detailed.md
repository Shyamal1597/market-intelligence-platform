# Sunidhi Research Intelligence Platform — Detailed Project Documentation

## Overview

An internal financial research intelligence platform built for Sunidhi Capital's ~15-person equity research team. Consolidates live market data, derivatives analytics, BSE filing monitoring, AI-powered earnings transcript analysis, and portfolio coverage tracking into a single Bloomberg-style dark terminal interface.

**Built as a solo full-stack developer.** Runs on an internal network with no authentication — designed for air-gapped deployment on a private server managed by IT.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS + custom dark editorial theme with CSS custom properties |
| Charts | Recharts |
| Icons | Lucide React |
| Fonts | Cormorant Garamond (display), JetBrains Mono (data), DM Sans (body) |
| Data Parsing | rss-parser, cheerio, fast-xml-parser, pdf2json |
| Storage | File-based JSON persistence, SQLite (reports) |
| AI/LLM | Anthropic Claude API (Haiku for extraction, Sonnet for verification) |
| Live Data | NSE India APIs, BSE XML feeds, Yahoo Finance, ICICI Breeze API, RSS feeds |
| Dev Server | Port 3001 via launch.json |

**No external database.** All persistence is JSON files on disk or SQLite for the reports module. Designed for zero-dependency internal deployment.

---

## Codebase Stats

| Metric | Value |
|---|---|
| Total TypeScript/TSX lines | ~25,500 |
| Pages (app routes) | 15 |
| API routes | 35+ |
| Components | 65+ |
| Library modules | 30+ |
| CLI scripts | 4 |
| Test files | 7 |

---

## Design System

**Aesthetic:** Bloomberg Terminal meets Financial Times editorial — information-dense, dark, precise.

| Token | Tailwind Class | Dark Value | Light Value |
|---|---|---|---|
| Background | `bg-base` | `#0C0E14` | `#F4F1EB` |
| Surface | `bg-surface` | `#13151E` | `#FFFFFF` |
| Border | `border-border` | `#1E2235` | `#E5DDD0` |
| Primary text | `text-primary` | `#F0EDE8` | `#1C1814` |
| Muted text | `text-muted` | `#6E7590` | `#8A7F74` |
| Accent (brand) | `text-amber` | `#F5820D` | `#F5820D` |
| Positive/up | `text-teal` | `#00C9A7` | `#00C9A7` |
| Negative/down | `text-danger` | `#E84040` | `#E84040` |

Dual light/dark theme system via `ThemeProvider` in `lib/theme.tsx`. All components use semantic CSS-variable Tailwind classes — never hardcoded hex values.

---

## Modules

### 1. Dashboard (`/`)

Central landing page with:
- Market overview widgets
- Live ticker strip across the top
- Macro indicator tiles
- Quick-access navigation grid
- Latest BSE filings preview
- Market news headlines
- Sector leaders preview

**Key components:** `DashboardShell`, `MetricsRow`, `MacroTiles`, `NewsHeadlines`, `DashboardFilings`, `QuickAccessGrid`, `TickerStrip`

---

### 2. Derivatives / Option Chain Terminal (`/derivatives`)

Full NSE option chain interface with institutional-grade analytics.

**Features:**
- Live option chain data with NSE session cookie bootstrapping (bypasses API anti-bot measures)
- Symmetric call/put table: OI, IV, LTP, change, bid/ask, volume, full Greeks
- ITM strike highlighting with diagonal stripe pattern
- ATM row auto-scroll on load
- Summary bar: Spot, ATM IV, PCR (color-coded bullish/bearish), Max Pain, Resistance/Support walls (peak OI strikes), Market Open/Closed status
- Aggregate metrics: Total OI and Volume (CE/PE split) with Cr/L/K formatting
- OI vs Volume bar mode toggle
- IV Skew visualization tab
- Configurable column visibility (persisted to localStorage)
- Auto-refresh polling (24s during market hours)
- Multi-expiry strip with weekly/monthly selection

**Max Pain calculation:** Standard algorithm iterating all strikes, computing total writer loss at each level.

**Resistance/Support:** Strike with highest CE open interest at/above spot (resistance), highest PE open interest at/below spot (support).

**Key components:** `OptionChainPage`, `OptionChainTable`, `ChainRow`, `ChainSummary`, `ExpiryStrip`, `SymbolSearch`, `ColumnToggle`, `VolatilityChart`

**API:** `/api/option-chain`, `/api/option-chain/expiries`

---

### 3. Management Guidance Tracker / Intel Dashboard (`/intel`)

**The flagship AI module.** Tracks whether company management delivers on forward-looking promises made during earnings calls. Uses a 5-stage pipeline to extract, verify, and summarize management guidance.

#### Pipeline Architecture

```
Stage 1: Excel Parsing (optional)
   Excel → fundamentals.json (PAT, ROA, ROE)
   
Stage 2: Transcript Ingestion
   PDF → text extraction → quarter detection → transcripts/{quarter}.txt
   
Stage 3: Claim Extraction (LLM — Claude Haiku)
   Transcript + sector registry → structured claims with metric, direction,
   magnitude, target quarter, confidence, conditional flags
   
Stage 4: Cross-Check (LLM — Claude Sonnet)
   Each claim verified against the target quarter's transcript
   Verdicts: met | moving | miss | pending | ambiguous
   
Stage 5: Summary Generation (LLM — Claude Sonnet)
   Per-quarter narrative summaries: headline, segment notes, key themes,
   on-track percentage
```

#### Transcript Sourcing (Hybrid)

**Primary — BSE Auto-Scrape:** SEBI LODR Schedule III mandates all listed companies file earnings call transcripts on BSE within 5 working days. The scraper (`lib/intel/bse-transcript-scraper.ts`):
- Polls BSE XML endpoint at `bseindia.com/xml-data/corpfiling/AcceptedXML/GetCorpFiling.aspx`
- Filters for transcript-category filings matching tracked symbols
- Downloads PDFs from `bseindia.com/xml-data/corpfiling/AttachLive/`
- Ingests text, detects quarter, triggers full pipeline
- Security: SSRF prevention (hostname validation, regex on attachment names), size guards (20MB), XXE-safe XML parsing

**Fallback — Web Upload:** Analysts upload transcript PDFs via the UI when BSE scraper misses one or they want faster ingestion.

#### Data Model

```
data/intelligence/{SYMBOL}/
  ├── transcripts/
  │   ├── Q1-FY26.txt
  │   ├── Q2-FY26.txt
  │   └── ...
  ├── uploads/        # raw uploaded PDFs
  ├── claims.json     # Stage 3 output
  ├── checks.json     # Stage 4 output
  └── summaries/
      ├── Q1-FY26.json
      └── ...
data/intelligence/_jobs/    # pipeline job tracking
data/intelligence/_scrape-log.json  # BSE scrape history
data/intelligence/registries/
  ├── bank.json
  └── insurance-holding.json
```

#### Sector Registry System

Each sector has a registry JSON defining the metrics to track:

```typescript
interface RegistryMetric {
  key: string;            // e.g. "nim"
  label: string;          // e.g. "Net Interest Margin"
  unit: "%" | "Cr" | "bps" | "x" | "ratio" | "count";
  direction: "higher-is-better" | "lower-is-better" | "neutral";
  segment: string;        // e.g. "Banking Operations"
  aliases: string[];      // alternative phrasings for LLM matching
  description: string;
}
```

**Current registries:** `bank` (HDFCBANK + 4 others mapped), `insurance-holding` (BAJAJFINSV)
**Planned:** 16 additional registries for NIFTY 100 expansion

#### Claim Types

```typescript
interface ExtractedClaim {
  id: string;
  metricKey: string;           // links to registry
  quote: string;               // verbatim from transcript
  speaker: string | null;
  direction: "value" | "range" | "up" | "down" | "stable";
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  targetQuarter: string | null;
  confidence: "high" | "medium" | "low";
  conditional: string | null;  // e.g. "subject to RBI approval"
}
```

#### Verdict System

```typescript
type Verdict = "met" | "moving" | "miss" | "pending" | "ambiguous";

interface ClaimCheck {
  claimId: string;
  verdict: Verdict;
  actualText: string | null;   // what management said about actuals
  quote: string | null;        // verbatim from target transcript (<=200 chars)
  reasoning: string;
  verifiedInQuarter: string;   // which transcript was used to verify
}
```

#### Frontend

**Bloomberg-style matrix view:** Segments as rows, quarters as columns. Each cell shows verdict distribution. Click to drill into individual claims.

**Components:** `IntelDashboard`, `IntelMatrix`, `SegmentCard`, `ClaimRow`, `ClaimDetail`, `QuarterTimeline`, `QuarterHeadline`, `StatusBadge`, `FiltersBar`, `TranscriptUpload`

**APIs:** `/api/intel/companies`, `/api/intel/[symbol]`, `/api/intel/[symbol]/summaries/[quarter]`, `/api/intel/upload`, `/api/intel/scrape`, `/api/intel/jobs`, `/api/intel/jobs/[jobId]`

#### Scale

| Metric | Current | Target (NIFTY 100) |
|---|---|---|
| Stocks tracked | 2 | ~100 |
| Sector registries | 2 | 18 |
| Transcripts ingested | 19 | ~500 (5 quarters x 100 stocks) |
| LLM cost | ~$0.50 spent | ~$11/year recurring |

---

### 4. BSE Filing Monitor (`/filings`)

Real-time BSE corporate filing feed.

- BSE XML API proxy with filing type categorization
- Color-coded badges: Financial Results, Board Meeting, Insider Trading, AGM, etc.
- Full-text search with company alias expansion
- Auto-refresh with new filing indicators

**API:** `/api/filings`

---

### 5. Coverage Intelligence (`/results`)

Research team's coverage universe management.

- Per-company metrics: latest rating, target price, report history
- Price Target Walk chart tracking TP evolution vs market price
- ICICI Breeze API integration for live/historical OHLC
- Analyst assignment tracking with badges
- Smart fallback: skips "Note"-type reports (no rating/TP) to surface most recent substantive report

**Components:** `CoverageIntelligence`, `CoverageRow`, `EarningsChart`, `FinancialsPanel`, `WatchlistManager`

**APIs:** `/api/coverage`, `/api/coverage/[symbol]`, `/api/coverage/[symbol]/financials`, `/api/breeze/historical/[symbol]`

---

### 6. Per-Stock Research Pages (`/research/[symbol]`)

Dynamic routes with:
- Company header with live price (via Breeze API)
- Quarterly results panel with financial metrics
- Shareholding pattern tracking
- Analyst notes panel with markdown editor
- Company filings panel
- Company news panel
- Company reports panel
- Thesis editor

**Components:** `CompanyHeader`, `QuarterlyResultsPanel`, `ShareholdingPanel`, `AnalystNotesPanel`, `CompanyFilingsPanel`, `CompanyNewsPanel`, `CompanyReportsPanel`, `ThesisEditor`

---

### 7. FII/DII Flow Tracker (`/flows`)

Institutional money flow tracking.

- FII and DII buy/sell/net data visualization
- Flow snapshot cards with period comparison
- Summary strip with trend indicators

**Components:** `FlowChart`, `FlowSnapshotCard`, `FlowSummaryStrip`

**API:** `/api/flows`

---

### 8. Macro Command Centre (`/macro`)

Yahoo Finance proxy for macro indicators.

- Metric tiles with sparkline charts
- Global markets tab for international indices
- Key economic indicators at a glance

**Components:** `MetricTile`, `Sparkline`, `GlobalMarkets`

**APIs:** `/api/macro`, `/api/macro/global`

---

### 9. Market News Aggregator (`/news`)

Multi-source RSS feed aggregation.

- Sources: ET Markets, Moneycontrol, LiveMint, etc.
- Server-side fetch and JSON persistence (up to 200 items in `data/market-news.json`)
- Category filtering and search

**APIs:** `/api/market-news`, `/api/fetch-market-news`

---

### 10. RAG PDF Report Viewer (`/reports`)

- SQLite-backed report metadata storage
- PDF upload and management
- Report search and filtering by analyst, company, date
- BM25-based search relevance scoring (`lib/bm25.ts`)

**Components:** `ReportsBrowser`, `RagChat`

**APIs:** `/api/reports/index`, `/api/reports/search`, `/api/reports/file`, `/api/reports/metadata`

---

### 11. Sector Leaderboard (`/sectors`)

- Sector performance comparison tiles
- Market breadth bars
- Stock-level leaderboard within each sector

**Components:** `SectorLeaderboard`, `SectorTile`, `BreadthBar`

**API:** `/api/sectors`

---

### 12. Portfolio Dashboard (`/portfolio`)

- Portfolio activity tracking
- Position-level activity timeline
- Sidebar with holdings overview

**Components:** `PortfolioActivityPanel`, `ActivityColumn`, `PortfolioSidebar`

**APIs:** `/api/portfolio/[symbol]/activity`, `/api/portfolio/general/activity`

---

### 13. Calendar (`/calendar`)

Corporate events calendar with BSE data integration.

**Components:** `CalendarEntry`

**API:** `/api/calendar`

---

### 14. Quick Links Hub (`/links`)

Curated external resource links for the research team.

**Data:** `lib/quick-links.ts`

---

### 15. Analyst Scorecard (`/analyst`)

Per-analyst performance tracking.

**Components:** `AnalystScorecard`, `CoverageTable`

---

## External API Integrations

| Integration | Purpose | Auth Method |
|---|---|---|
| NSE India | Option chains, derivatives, quotes, filings, shareholding, insider data, FII/DII flows | Session cookie bootstrapping with browser-mimicking headers |
| BSE India | Corporate filings XML feed, transcript PDFs | Public (no auth) |
| Yahoo Finance | Macro indicators, global markets | Public proxy |
| ICICI Breeze | Live/historical OHLC price data | API key + secret in `.env.local` |
| Anthropic Claude | LLM for claim extraction (Haiku) and cross-check verification (Sonnet) | API key in `.env.local` |
| RSS Feeds | Market news from ET Markets, Moneycontrol, LiveMint, etc. | Public |

---

## CLI Scripts

| Script | Purpose |
|---|---|
| `scripts/intel-rebuild.ts` | Full pipeline rebuild for a symbol (stages 1-5) |
| `scripts/_one-off-crosscheck.ts` | Run cross-check (stage 4) alone for a symbol |
| `scripts/_one-off-extract.ts` | Run claim extraction (stage 3) alone for a symbol |
| `scripts/generate-summaries.ts` | Generate quarterly summaries (stage 5) |

```bash
npx tsx scripts/intel-rebuild.ts HDFCBANK --stage=3
npx tsx scripts/_one-off-crosscheck.ts BAJAJFINSV
```

---

## Security Measures

- **SSRF prevention:** BSE scraper validates hostnames, URL-encodes attachment names, rejects non-BSE URLs
- **Path traversal prevention:** Quarter values validated with `/^Q[1-4]-FY\d{2}$/` before use in file paths; jobIds validated with `/^job_[a-z0-9_]+$/i`
- **XXE prevention:** fast-xml-parser configured with `processEntities: false`
- **PDF validation:** Magic bytes check (`%PDF-`), 20MB size limit, extension validation
- **Input validation:** All API routes validate symbol against `SYMBOL_SECTOR`, quarter format via `normalizeQuarter`
- **Company fingerprint validation:** Prevents cross-contamination of transcripts between companies

---

## Data Architecture

```
data/
├── intelligence/              # Intel Dashboard data
│   ├── HDFCBANK/
│   │   ├── transcripts/       # Q1-FY25.txt, Q2-FY25.txt, ...
│   │   ├── uploads/           # raw PDFs
│   │   ├── claims.json        # extracted claims
│   │   ├── checks.json        # cross-check verdicts
│   │   └── summaries/         # quarterly summary JSONs
│   ├── BAJAJFINSV/
│   ├── registries/            # sector metric definitions
│   ├── _jobs/                 # pipeline job tracking
│   └── _scrape-log.json       # BSE scrape history
├── market-news.json           # persisted news (200 items max)
├── watchlist.json             # watchlist state
├── notes/                     # analyst notes per symbol
├── thesis/                    # investment thesis per symbol
└── reports.db                 # SQLite for report metadata
```

---

## Active Development: NIFTY 100 Expansion

The Intel Dashboard is scaling from 2 stocks to ~100 (NIFTY 50 + NIFTY Next 50) across 18 sectors.

**Status:**
- Phase 1 (Infrastructure) — COMPLETE: pipeline refactored, BSE auto-scraper built, upload API + UI deployed
- Phase 2 (First batch registries) — NOT STARTED
- Phase 3 (Data seeding) — NOT STARTED
- Phase 4 (Remaining registries) — NOT STARTED
- Phase 5 (Frontend scaling) — NOT STARTED
- Phase 6 (Parallelization) — NOT STARTED

**Parallel workstream:** Stage 4 redesign to verify claims against next-quarter transcripts instead of Excel fundamentals data (plan exists at `docs/plans/` — replaces `hit/miss/no-data` with `met/moving/miss/pending/ambiguous` verdicts).

---

## Deployment

- **Current:** Dev server on `localhost:3001` via Next.js dev mode
- **Target:** Private server on Sunidhi Capital's internal network, managed by IT team
- **Production build:** `npx next build` generates static + server output
- **No Docker required** — standard Node.js deployment
- **Environment:** `.env.local` with `BREEZE_API_KEY`, `BREEZE_SECRET_KEY`, `ANTHROPIC_API_KEY`

---

## File Counts by Area

| Area | Files | Description |
|---|---|---|
| `app/` pages | 15 | Next.js page routes |
| `app/api/` routes | 35+ | REST API endpoints |
| `components/` | 65+ | React components |
| `lib/` | 30+ | Business logic, data fetching, utilities |
| `lib/intel/` | 15 | Intel pipeline (LLM, extraction, cross-check, registry, types) |
| `scripts/` | 4 | CLI tools for pipeline operations |
| `docs/plans/` | 20+ | Design docs, implementation plans, changelogs |
