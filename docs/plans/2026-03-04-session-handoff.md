# Session Handoff — 2026-03-04

## Project
**Sunidhi Research Intelligence Platform** — internal financial intranet for Sunidhi Capital's research team.
Stack: Next.js 16 App Router, TypeScript, Tailwind CSS, Recharts, Lucide React.
No auth, no database. File-based JSON persistence. Internal network only.

---

## What Has Been Built (All Complete + Committed)

| Route | Feature | Status |
|-------|---------|--------|
| `/` | Dashboard — ticker strip, macro tiles, news feed, BSE filings | ✅ |
| `/news` | Market News — RSS-fed, persisted to `data/market-news.json` | ✅ |
| `/macro` | Macro Command Centre — Yahoo Finance metrics + sparklines | ✅ |
| `/filings` | BSE Filing Monitor — live XML feed, category badges | ✅ |
| `/calendar` | Earnings Calendar — NSE event-calendar API, 29 live entries | ✅ |
| `/sectors` | Sector Dashboard — 10 Nifty sector indices, live via Yahoo Finance | ✅ |
| `/flows` | FII/DII Flow Tracker — snapshot cards, chart, summary strip | ✅ |
| `/links` | Quick Links Hub | ✅ |

### FII/DII Flows — Key Technical Notes
- **Snapshot**: `NSE fiidiiTradeReact` — requires two-step session cookie warm-up (homepage → market-data/fii-dii-data page). Returns equity-only data, no `type` field.
- **Historical**: NSE `historicaldata-fiiDii` → 404 (dead). `historical/fii-dii` → 503 (blocked). Both endpoints are dead/inaccessible from server-side.
- **Solution**: File-based accumulation in `data/fii-dii-history.json` — same pattern as `market-news.json`. Today's snapshot appended on each API hit.
- **Nifty overlay**: Yahoo Finance `/v8/finance/chart/%5ENSEI?interval=1d&range=1y` — works reliably, returns ~247 entries.
- NSE session: `getNseCookies()` in `lib/nse-flows.ts` — hits homepage then FII/DII page before API calls.

---

## Design System (Never Violate)
- **Background**: `#0C0E14` with SVG grain texture
- **Surface**: `#13151E` / `#1E2235` borders
- **Accent amber**: `#F5820D` (primary interactive)
- **Teal**: `#00C9A7` (positive/up)
- **Danger**: `#E84040` (negative/down)
- **Text**: `#F0EDE8`
- **Fonts**: Cormorant Garamond (display), JetBrains Mono (data), DM Sans (body)
- **Aesthetic**: Bloomberg Terminal × Financial Times Editorial — dense, dark, precise
- **Never**: generic gradients, purple-on-white, Inter/Roboto/Arial, card grids without editorial intent

---

## Next Features to Build (Approved Design)

### Shared Foundation — Watchlist
- **File**: `data/watchlist.json`
- **Seed**: NSE equity-stockIndices API (`equity-stockIndices?index=NIFTY%2050`) on first run
- **Schema per entry**:
```json
{
  "symbol": "RELIANCE",
  "bseCode": "500325",
  "name": "Reliance Industries",
  "sector": "Energy",
  "yahooTicker": "RELIANCE.NS",
  "marketCapBucket": "largecap",
  "analyst": "",
  "rating": "Buy",
  "targetPrice": null,
  "addedAt": "2026-03-04"
}
```
- **API routes**: `GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/[symbol]`
- Adding a stock validates it against NSE before saving

---

### Feature 3: Earnings Intelligence Dashboard (`/results`)

**Approved layout: Option C — Split View**
- Left panel: compact sortable list of all coverage stocks, showing latest quarter PAT + YoY delta
- Right panel: clicking a stock instantly loads its full multi-quarter chart inline (no navigation)
- Filter bar: by sector, rating, market cap bucket
- Watchlist management strip: pills with ✕, Add Stock input, ↺ Nifty50 reset button

**Data source**: Yahoo Finance `quoteSummary` with `incomeStatementHistoryQuarterly`
- Endpoint: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=incomeStatementHistoryQuarterly`
- Returns 4 quarters: `totalRevenue`, `ebit` (EBITDA proxy), `netIncome` (PAT), `basicEps`
- Quarter label derived from `endDate` (e.g. Q3 FY26)
- Persisted to `data/earnings/[symbol].json` to accumulate history over time
- Stale threshold: 6 hours, or immediate refresh when BSE filing monitor catches a `results`-category filing for that scrip code

**Right panel chart**: Multi-quarter Recharts `ComposedChart` — bars for absolute values, line for YoY% growth. Toggle: Revenue / EBIT / PAT / EPS. Same dark editorial aesthetic as existing charts.

---

### Feature 4: Company Intelligence Cards (`/research/[symbol]`)

**Approved layout: Unified page, Option B (single company = one page with everything)**

**Two-column layout**:
```
LEFT (60%)                          RIGHT (40%)
─────────────────────────────────   ─────────────────────────────
QUARTERLY RESULTS                   SHAREHOLDING PATTERN
[multi-quarter chart + table]       Promoter / FII / DII / Public %
                                    (BSE shareholding API, quarterly)
RECENT NEWS
[last 5 from market-news.json       BULL / BEAR THESIS
 filtered by company name]          [Editable bull textarea]
                                    [Editable bear textarea]
RECENT FILINGS                      [Save → POST /api/thesis/[symbol]]
[last 10 BSE filings for scripCode]
                                    COVERAGE DETAILS
ANALYST NOTES                       Analyst | Rating | Target Price
[list of PDFs from                  [inline editable fields]
 public/notes/[SYMBOL]/]
```

**Page header**: Company name, NSE symbol, sector, live price + change (Yahoo Finance), BSE code, rating badge.

**Data sources**:
- Live price: Yahoo Finance chart API (`RELIANCE.NS`)
- Earnings: same `data/earnings/[symbol].json` built by `/results`
- News: filter `data/market-news.json` by company name (case-insensitive contains)
- Filings: live BSE XML API filtered by `bseCode` (already in `lib/bse-filings.ts`)
- Shareholding: BSE shareholding API — `https://api.bseindia.com/BseIndiaAPI/api/Shareholding/w?scripcode=500325` (may need session cookies like NSE)
- Analyst notes: `GET /api/notes/[symbol]` reads `fs.readdir('public/notes/[SYMBOL]/')`, files served statically from `/notes/[SYMBOL]/file.pdf`
- Bull/bear thesis: `data/thesis/[symbol].json` — `{ bull: string, bear: string, updatedAt: string }`
- Coverage metadata (analyst, rating, TP): read/write via `PATCH /api/watchlist/[symbol]`

---

## File Structure After Both Features

```
app/
├── results/
│   └── page.tsx                    # Earnings Intelligence Dashboard
├── research/
│   └── [symbol]/
│       └── page.tsx                # Unified Company Research Page
├── api/
│   ├── watchlist/
│   │   ├── route.ts                # GET, POST
│   │   └── [symbol]/
│   │       └── route.ts            # DELETE, PATCH
│   ├── earnings/
│   │   └── [symbol]/
│   │       └── route.ts            # GET (Yahoo Finance + cache)
│   ├── shareholding/
│   │   └── [symbol]/
│   │       └── route.ts            # GET (BSE API)
│   ├── thesis/
│   │   └── [symbol]/
│   │       └── route.ts            # GET, POST
│   └── notes/
│       └── [symbol]/
│           └── route.ts            # GET (readdir)
components/
├── results/
│   ├── EarningsSplitView.tsx       # Split list + chart panel
│   ├── EarningsListRow.tsx         # One row in left panel
│   ├── EarningsChart.tsx           # Right panel chart
│   └── WatchlistManager.tsx        # Pills + add/remove UI
└── research/
    ├── CompanyHeader.tsx
    ├── QuarterlyResultsPanel.tsx
    ├── ShareholdingPanel.tsx
    ├── ThesisEditor.tsx
    ├── CompanyNewsPanel.tsx
    ├── CompanyFilingsPanel.tsx
    └── AnalystNotesPanel.tsx
lib/
├── watchlist.ts                    # load/save/seed watchlist
└── earnings.ts                     # Yahoo Finance quarterly fetch + cache
data/
├── watchlist.json                  # Coverage universe (Nifty50 seed)
├── thesis/                         # Per-stock bull/bear thesis
│   └── [symbol].json
└── earnings/                       # Persisted quarterly results
    └── [symbol].json
public/
└── notes/                          # Analyst PDFs (manually placed)
    └── [SYMBOL]/
        └── *.pdf
```

---

## Sidebar Navigation to Add
- "Results" → `/results` (icon: `BarChart2` or `TrendingUp`)
- Individual company pages accessed via `/results` only (no sidebar entry for `/research`)

---

## User Instructions & Preferences
- No sycophancy. Be matter-of-fact.
- No timeline estimates in plans.
- No Claude co-author in git commits.
- Use Skills from `~/.claude/skills/` when tasks match.
- Challenge weak reasoning. Prioritize truth.
- Subagent-driven development: implement in same session using TodoWrite + direct file writes (code-architect subagent has no write tools).
- NSE APIs often require session cookies — always warm up session first.
- BSE APIs may similarly need session warm-up (test this during implementation).
- File-based persistence is the standard pattern — no database, no external services.
- Design aesthetic is non-negotiable: Bloomberg × FT Editorial. Dense. Dark. Precise.

---

## Known Working API Endpoints

| Endpoint | Notes |
|----------|-------|
| `https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1y` | Daily OHLCV, ~247 entries |
| `https://query1.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=incomeStatementHistoryQuarterly` | 4 quarters of P&L |
| `https://www.nseindia.com/api/fiidiiTradeReact` | Today's FII/DII (requires NSE session cookies) |
| `https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050` | Nifty50 constituents |
| `https://www.nseindia.com/api/event-calendar` | Earnings calendar |
| `https://www.bseindia.com/xml-data/corpfiling/AcceptedXML/GetCorpFiling.aspx` | BSE filings XML |

## Known Dead/Blocked Endpoints

| Endpoint | Status |
|----------|--------|
| `https://www.nseindia.com/api/historicaldata-fiiDii` | 404 — removed |
| `https://www.nseindia.com/api/historical/fii-dii` | 503 — blocked server-side |

---

## Next Immediate Action
1. Invoke `superpowers:writing-plans` skill to create implementation plan for Features 3 & 4
2. Implement using `superpowers:subagent-driven-development`
3. Start with shared watchlist foundation, then `/results`, then `/research/[symbol]`
