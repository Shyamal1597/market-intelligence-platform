# Market Intelligence Platform

Production internal research platform for an equity research firm. Bloomberg Terminal-inspired dark UI serving a 15-analyst equity research team.

**Built solo. 25,500+ lines of TypeScript. 15 modules. 237+ commits.**

## What It Does

Centralises equity research workflows into a single internal platform — live market data, earnings analysis, derivatives pricing, portfolio tracking, and an AI-powered management guidance tracker that cross-verifies what company management promised against what they actually delivered.

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
| **Management Guidance Tracker** | 5-stage LLM pipeline: ingest earnings transcripts → extract forward-looking claims → cross-verify against next quarter's results → generate analyst summaries. Tracks 100 stocks across 19 sectors. Bloomberg-style matrix view with segment drill-down. |
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

The most architecturally complex module — a 5-stage pipeline that answers: *"Did management deliver on what they promised?"*

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

## Security Hardening

- SSRF prevention on all external URL fetches (allowlisted domains, private IP blocking)
- XXE prevention on XML parsing (disabled DTD/external entities)
- Path traversal validation on file operations
- Company fingerprint checks on transcript ingestion
- No secrets in client bundles — all API keys server-side only
- Input validation on every API route

## Design System

Bloomberg Terminal meets Financial Times editorial. Dense, data-forward, precise.

- Dark theme: `#0C0E14` base with warm off-white text (`#F0EDE8`)
- Accent orange `#F5820D` (brand), teal `#00C9A7` (positive), red `#E84040` (negative)
- All colours via CSS custom properties — full light theme support
- SVG grain texture overlay for editorial depth

## Project Structure

```
app/                    # Next.js App Router — 40+ API routes
components/             # 50+ React components across 12 domains
lib/                    # Core logic — Intel pipeline, BSE scraper, theme system
scripts/                # CLI tools — pipeline rebuild, transcript seeding, one-off extraction
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
```

## Tech Decisions Worth Noting

- **File-based persistence over database** — internal tool with single-digit concurrent users; JSON files are inspectable, diffable, zero-config
- **NSE session bootstrapping** — NSE blocks direct API access; the platform maintains authenticated sessions by mirroring browser cookie flows
- **insecureHTTPParser for BSE** — BSE India sends malformed HTTP headers that crash Node's strict parser; handled via `node:https` with lenient parsing
- **Sector-first LLM prompts** — generic extraction misses domain KPIs; sector registries ensure the model asks about NIM for banks, VNB margin for insurers
- **"LLM writes words, not numbers"** — all quantitative verification uses structured data; LLM only classifies verdicts from transcript evidence

## License

Private / Internal Use
