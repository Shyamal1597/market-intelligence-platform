# Market Intelligence Platform

Internal research intelligence platform for equity research teams, traders, sub-brokers, and associated persons (APs). Bloomberg Terminal-inspired dark UI — built for internal use at a retail broking firm.

**Built solo using AI-assisted development.**

## Who It's For

This platform consolidates market intelligence workflows for three internal audiences:

- **Equity Research Analysts** — earnings analysis, management guidance tracking, coverage universe management, sector deep-dives
- **Traders** — live derivatives terminal with Greeks and Max Pain, real-time option chains, FII/DII flow tracking, macro dashboard
- **Sub-Brokers & Associated Persons (APs)** — quick-access research reports, filing alerts, sector leaderboard, per-stock research pages, curated quick links to broker portals and regulatory filings

All data stays internal — no external SaaS, no third-party cloud. Runs on a single internal server; access restricted to firm network.

## What It Does

Centralises equity research and trading intelligence into a single intranet platform — live market data, earnings analysis, derivatives pricing, portfolio tracking, and an AI-powered management guidance tracker that cross-verifies what company management promised against what they actually delivered.

## Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS — custom dual-theme design system (dark + light), editorial typography (Cormorant Garamond + JetBrains Mono + DM Sans)
- **Data**: File-based JSON persistence, SQLite (reports), no external database
- **Integrations**: BSE India API, NSE live feeds, ICICI Breeze API, Yahoo Finance, RSS aggregation
- **AI Pipeline**: 5-stage LLM pipeline (Claude/Ollama) for earnings transcript analysis
- **Security**: SSRF prevention, XXE prevention, path traversal validation, CSP headers, input sanitisation on all API routes

## Modules

| Module | Description |
|--------|-------------|
| **Management Guidance Tracker** | 5-stage LLM pipeline: ingest earnings transcripts → extract forward-looking claims → cross-verify against next quarter's results → generate analyst summaries. Tracks 100 stocks across 19 sectors. Bloomberg-style matrix view with segment drill-down. Actuals engine surfaces transcript evidence for each claim. |
| **Derivatives Terminal** | Real-time option chain with Greeks (Delta, Gamma, Theta, Vega, IV), Max Pain algorithm, Put-Call Ratio, IV skew visualization. NSE session cookie bootstrapping for live data. |
| **Coverage Intelligence** | Analyst coverage dashboard — rating history, price target walks with Recharts visualization, report timeline, financial panel with quarter-over-quarter comparison. |
| **Per-Stock Research** | Single-stock deep dive — quarterly results panel, shareholding pattern tracker (FII/DII/Promoter), peer comparison, Breeze price history integration. |
| **Portfolio Dashboard** | Watchlist management with live P&L, sector allocation, bulk import. JSON persistence with optimistic UI updates. |
| **Macro Command Centre** | Global indices, commodity prices, currency rates, yield curves, FII/DII flow tracking with historical charts. |
| **BSE Filing Monitor** | Real-time corporate filing feed from BSE XML/JSON API. Categorised by filing type, full-text search. |
| **Earnings Calendar** | Upcoming results calendar with date-based filtering and notification markers. |
| **Market News Aggregator** | Multi-source RSS aggregation (Moneycontrol, ET, Livemint, Reuters) with deduplication and sentiment tagging. |
| **Sector Leaderboard** | NIFTY sector indices with breadth indicators, relative performance ranking, advance-decline visualization. |
| **RAG PDF Viewer** | Upload research PDFs, auto-chunk with BM25 search, inline viewer with highlighted search results. |
| **Quick Links Hub** | Curated research resource directory — broker portals, data terminals, regulatory filings. |
| **Analyst Scorecard** | Track analyst accuracy over time — target price hit rates, rating distribution, coverage breadth. |
| **Ticker Strip** | Live scrolling price ticker with WebSocket-style polling, configurable watchlist. |
| **Theme System** | Dual-theme (dark editorial + light) with CSS custom properties, localStorage persistence, zero-FOUC switching. |

## Intel Pipeline (Management Guidance Tracker)

A 5-stage pipeline that answers: *"Did management deliver on what they promised?"*

```
Stage 1: Parse Excel fundamentals (optional — Bloomberg/CIQ export)
Stage 2: Ingest earnings call transcripts (PDF → text extraction)
Stage 3: Extract forward-looking claims via LLM (sector-aware prompts)
Stage 4: Cross-verify claims against next quarter's transcript
Stage 5: Generate quarterly narrative summaries
```

- **Sector registries** define KPI schemas per industry (banking: NIM, GNPA, CASA; insurance: VNB margin, combined ratio; IT: deal TCV, attrition)
- **BSE auto-scraper** discovers and downloads new transcripts via BSE India JSON API
- **Company fingerprint validation** prevents cross-contamination from incorrect scrip code mappings
- **Verdict system**: `met | moving | miss | pending | ambiguous` with reasoning traces and verbatim transcript quotes
- **Actuals engine**: zero-cost keyword search surfaces transcript sentences that mention each claim's metric — visible as collapsible evidence snippets on every guidance card, no LLM credits required

### Current Coverage

- 100 stocks tracked across 19 NIFTY sectors (NIFTY 50 + Next 50)
- 98/100 symbols with extracted claims for FY26 quarters
- 137+ actuals (transcript evidence snippets) across 52 symbols
- Per-company data quality notes surface missing data without blocking the UI

## Recent Additions

| Feature | Description |
|---------|-------------|
| **Transcript Evidence (Actuals)** | Each guidance claim now shows a collapsible panel with sentences from the target quarter's transcript that mention the relevant metric — sourced via keyword search, zero LLM cost. |
| **Data Quality Banner** | Per-company completeness notes moved to page bottom; non-blocking. Flags missing transcripts, unprocessed quarters, and extraction failures in plain English. |
| **FII/DII Flow Tracker** | Gap detection for missing daily data with automatic fill-forward; 1-year retention; Excel import for historical seeding. |
| **BSE Sector Grid** | Auto-scraped SENSEX sector indices with breadth and relative performance, updated EOD. |
| **EOD Report Export** | One-click Excel report generation with full styling via ExcelJS — snippets format for daily distribution. |
| **Analyst Scorecard** | Accuracy tracking for internal analysts — rating hit rates, PT achievement, coverage breadth over time. |

## Security Hardening

- SSRF prevention on all external URL fetches (allowlisted domains, private IP blocking)
- XXE prevention on XML parsing (disabled DTD/external entities)
- Path traversal validation on file operations
- Company fingerprint checks on transcript ingestion
- No secrets in client bundles — all API keys server-side only
- Input validation on every API route

## Design System

Dark editorial UI with a dual-theme system (dark default, light optional).

- Dark theme: `#0C0E14` base with warm off-white text (`#F0EDE8`)
- Accent orange `#F5820D` (brand), teal `#00C9A7` (positive), red `#E84040` (negative)
- All colours via CSS custom properties — full light theme support
- SVG grain texture overlay for depth

## Project Structure

```
app/                    # Next.js App Router — 40+ API routes
components/             # 50+ React components across 12 domains
lib/                    # Core logic — Intel pipeline, BSE scraper, theme system
scripts/                # CLI tools — pipeline rebuild, transcript seeding, actuals builder
data/                   # Runtime data (gitignored) — transcripts, claims, market data
docs/                   # Architecture docs, changelogs, project briefs
```

## Setup

```bash
npm install
cp .env.local.example .env.local    # Add API keys
npm run dev                          # http://localhost:3000
```

### Intel Pipeline

```bash
# Seed transcripts from BSE
npx tsx scripts/intel-seed-transcripts.ts

# Run full pipeline for a symbol
npm run intel:rebuild HDFCBANK

# Run specific stage
npm run intel:rebuild HDFCBANK --stage=3

# Build actuals (transcript evidence, zero LLM cost)
npx tsx scripts/build-actuals.ts
```

## Tech Decisions Worth Noting

- **File-based persistence over database** — internal tool with single-digit concurrent users; JSON files are inspectable, diffable, zero-config
- **NSE session bootstrapping** — NSE blocks direct API access; the platform maintains authenticated sessions by mirroring browser cookie flows
- **insecureHTTPParser for BSE** — BSE India sends malformed HTTP headers that crash Node's strict parser; handled via `node:https` with lenient parsing
- **Sector-first LLM prompts** — generic extraction misses domain KPIs; sector registries ensure the model asks about NIM for banks, VNB margin for insurers
- **"LLM writes words, not numbers"** — all quantitative verification uses structured data; LLM only classifies verdicts from transcript evidence
- **Keyword actuals before LLM actuals** — transcript evidence is surfaced via a deterministic keyword search pass first; LLM-based extraction is a planned upgrade once budget permits

## License

Private / Internal Use
