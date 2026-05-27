# Market Intelligence Platform — Development Guidelines

## Project Overview
Internal financial research intranet for an equity research team. Next.js 16 App Router, TypeScript, Tailwind CSS. File-based JSON persistence. Serves ~15 analysts on internal network.

## Stack
- **Framework**: Next.js 16 + TypeScript
- **Styling**: Tailwind CSS with custom dark editorial theme
- **Icons**: Lucide React
- **Charts**: Recharts
- **Fonts**: Cormorant Garamond (display) + JetBrains Mono (data) + DM Sans (body)
- **Parsing**: rss-parser, cheerio, fast-xml-parser

## Design System
- **Aesthetic**: Bloomberg Terminal × Financial Times Editorial — dense, dark, precise
- **Background**: `#0C0E14` with SVG grain texture
- **Surface**: `#13151E` with `#1E2235` borders
- **Accent amber**: `#F5820D` — primary interactive accent (brand orange)
- **Teal**: `#00C9A7` — positive/up indicators
- **Danger**: `#E84040` — negative/down indicators
- **Text primary**: `#F0EDE8` (warm off-white)

## Project Structure
```
app/                    # Next.js App Router pages + API routes
├── api/
│   ├── macro/          # Yahoo Finance proxy
│   ├── filings/        # BSE XML feed proxy
│   ├── market-news/    # Serve stored news JSON
│   ├── fetch-market-news/  # Pull from RSS feeds
│   ├── coverage/       # SQLite-backed coverage universe + [symbol]/financials
│   ├── breeze/         # ICICI Breeze live price data (auth, historical/[symbol])
│   ├── watchlist/      # Watchlist CRUD (JSON persistence) + [symbol] PATCH
│   └── reports/        # PDF report management
├── page.tsx            # Dashboard
├── news/               # Market News
├── macro/              # Macro Command Centre
├── filings/            # BSE Filing Monitor
├── links/              # Quick Links Hub
├── results/            # Earnings Intelligence (CoverageIntelligence)
├── reports/            # RAG PDF viewer
└── research/[symbol]/  # Per-stock research page
components/
├── layout/             # Sidebar, TopBar, TickerStrip
├── dashboard/          # Dashboard widgets
├── macro/              # MetricTile, Sparkline
├── results/            # CoverageIntelligence, CoverageRow, FinancialsPanel, …
├── research/           # CompanyHeader, QuarterlyResultsPanel, ShareholdingPanel, …
└── ui/                 # Badge, SectionHeader
lib/
├── db.ts               # SQLite via better-sqlite3 (reports table)
├── theme.tsx           # ThemeProvider — dual theme with CSS custom properties
└── watchlist.ts        # Watchlist JSON helpers
```

---

## Theme System

`lib/theme.tsx` — `ThemeProvider` sets `data-theme` on `<html>` and injects CSS custom properties. Preference persisted in `localStorage`.

| Tailwind class | CSS var | Dark value | Light value |
|---|---|---|---|
| `bg-base` | `--color-base` | `#0C0E14` | `#F4F1EB` |
| `bg-surface` | `--color-surface` | `#13151E` | `#FFFFFF` |
| `border-border` | `--color-border` | `#1E2235` | `#E5DDD0` |
| `text-primary` | `--color-primary` | `#F0EDE8` | `#1C1814` |
| `text-muted` | `--color-muted` | `#6E7590` | `#8A7F74` |
| `text-amber` | `--color-amber` | `#F5820D` | `#F5820D` |
| `text-teal` | `--color-teal` | `#00C9A7` | `#00C9A7` |
| `text-danger` | `--color-danger` | `#E84040` | `#E84040` |

**Critical rule**: Always use CSS-variable Tailwind classes (`bg-surface`, `text-primary`, `border-border`) for component backgrounds and text. Never hardcode hex values directly — breaks light theme.

**Exceptions**: Recharts chart internals (SVG grid/axis) and `CustomTooltip` components — intentionally dark regardless of theme.

---

## Coverage Intelligence — Key Patterns

- **Metric tiles**: `bg-surface border-border rounded-lg`
- **Rating tile**: uses `ratingBg()` for theme-compatible Tailwind strings
- **Price Target Walk chart**: fixed `h-[300px]` container, `domain={["auto","auto"]}` on `YAxis`
- **API fallback**: `reports.find(r => r.rating) ?? reports[0]` — prevents "Note"-type reports from blanking metric tiles

---

## Development Workflow

### Communication Standards
- Be direct and concise — no filler
- Challenge weak assumptions
- Quality over speed
- Use Mermaid diagrams for complex systems

### Feature Development Process
1. Implement feature from issue specification
2. Run code quality evaluation against requirements
3. Fix flagged issues before merging
4. Update documentation
5. Verify all tests pass

---

## Secure Coding Guide

### Core Principles
- Defense in depth — never rely on a single security control
- Fail securely — deny access on failure
- Least privilege — minimum permissions necessary
- Input validation — never trust user input, validate server-side
- Output encoding — context-appropriate encoding for all rendered data

### Security Checklist

**Access Control:**
- Verify resource ownership on every request
- Use UUIDs over sequential IDs
- Validate role permissions server-side

**XSS Prevention:**
- Context-specific output encoding (HTML, JS, URL, CSS)
- Content Security Policy headers
- Input sanitization with DOMPurify where HTML is needed

**CSRF Protection:**
- Cryptographically random tokens tied to session
- SameSite cookie attributes
- Token validation on all state-changing requests

**SSRF Prevention:**
- Allowlist approach for external URL fetches
- Block private/internal IPs and cloud metadata endpoints
- Validate URL scheme (HTTP/HTTPS only)
- Limit redirects, set timeouts, cap response size

**SQL Injection:**
- Parameterized queries exclusively
- Whitelist-only for ORDER BY and table/column names
- Least privilege database user

**XXE Prevention:**
- Disable DTD processing and external entity resolution
- Disable XInclude processing

**Path Traversal:**
- Indirect references (map key → path) over user-supplied paths
- Canonicalize and validate against base directory

**File Upload:**
- Extension allowlist + magic byte validation
- Rename to UUID, store outside webroot
- Serve with `Content-Disposition: attachment`

### Security Headers
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Intel Pipeline — Current Status

### Architecture (5-stage LLM pipeline)
```
Stage 1: Parse Excel fundamentals (OPTIONAL — legacy, not needed for new flow)
Stage 2: Ingest transcripts (PDF → text via pdf2json + pdfminer fallback)
Stage 3: Extract forward-looking claims (LLM, sector-aware prompts)
Stage 4: Cross-verify claims against NEXT quarter's transcript (LLM) ← REWRITTEN
Stage 5: Generate quarterly narrative summaries (LLM)
```

### What's Done
- **SYMBOL_SECTOR**: 100 stocks across 19 sectors (NIFTY 50 + Next 50)
- **BSE scraper**: Migrated from dead XML endpoint to live JSON API (`api.bseindia.com`). Uses `node:https` with `insecureHTTPParser: true` for BSE's malformed headers.
- **BSE_SCRIP_TO_SYMBOL**: ~95 verified scrip codes mapped to symbols
- **COMPANY_NAME_PATTERNS**: ~100 fingerprint patterns for transcript validation
- **Stage 4 rewrite**: Complete. Uses transcript-based verification with `met/moving/miss/pending/ambiguous` verdicts instead of Excel-based `hit/miss/partial/no-data`
- **Frontend**: StatusBadge, FiltersBar, ClaimRow, IntelDashboard, companies API all updated for new verdict system
- **Transcript seeding**: First run complete — 50 transcripts across 32 stocks (mostly Q4-FY26 only; BSE purges old attachments after ~2 months)

### What's NOT Done — Next Steps
1. **Sector registries** — Only `bank` and `insurance-holding` registries exist. Need 17 more for: nbfc, insurance-life, financial-services, it-services, pharma, auto, fmcg, oil-gas-energy, metals-mining, power-utilities, telecom, cement-building, capital-goods-infra, defence, consumer-retail, aviation, real-estate
2. **Run LLM pipeline** — No Anthropic API credits currently. Once available, run Stages 3-5 for all stocks with transcripts: `npm run intel:rebuild SYMBOL --stage=3`
3. **Retry failed BSE downloads** — ~15 stocks timed out during seeding (TCS, HCLTECH, CIPLA, ITC, HINDUNILVR, etc.). Retry with: `npx tsx scripts/intel-seed-transcripts.ts TCS HCLTECH CIPLA`
4. **Historical transcript sourcing** — BSE only has current quarter. For cross-checking (Stage 4), need ≥2 consecutive quarters per stock. Manual upload via `/api/intel/upload` or alternative sources needed.
5. **Frontend scaling** — `/intel` page needs to handle 100 stocks (currently works for 2). May need pagination, search, sector filtering.

### Key Files
- `lib/intel/types.ts` — All type definitions, SYMBOL_SECTOR map (100 stocks)
- `lib/intel/crossCheck.ts` — Stage 4 (transcript-based, REWRITTEN)
- `lib/intel/bse-transcript-scraper.ts` — BSE JSON API scraper, SYMBOL_TO_SCRIP map
- `lib/intel/pipeline.ts` — PDF ingestion (ingestPdfTranscript)
- `lib/intel/extractClaims.ts` — Stage 3 claim extraction
- `lib/intel/registry.ts` — Sector registry loader
- `scripts/intel-seed-transcripts.ts` — Bulk BSE transcript downloader
- `scripts/intel-rebuild.ts` — Full pipeline runner
- `data/intelligence/{SYMBOL}/transcripts/*.txt` — Extracted transcript text
- `data/intelligence/registries/*.json` — Sector metric definitions

---

## Secrets

- `ANTHROPIC_API_KEY` — required for LLM pipeline. Place in `.env.local` (gitignored).
- `BREEZE_API_KEY` / `BREEZE_SECRET_KEY` — required for live price data. Place in `.env.local`.
- Never commit `.env.local` — use `.env.local.example` for placeholder reference.
