# Sunidhi Intranet — Session Context

> Bootstrap file for continuing development. Read this before touching any file.

## Project

**Name**: Sunidhi Research Intelligence Platform  
**Path**: `D:\Sunidhi-Intranet-Futuristic`  
**Stack**: Next.js 16 App Router · TypeScript · Tailwind CSS · Lucide React · Recharts  
**Run**: `npm run dev` → `localhost:3001`  
**Type check**: `npx tsc --noEmit -p tsconfig.json`

---

## Design System (non-negotiable)

| Token | Value | Use |
|---|---|---|
| Background | `#0C0E14` | page bg |
| Surface | `#13151E` | cards |
| Border | `#1E2235` | dividers |
| Amber | `#F5820D` | primary accent / interactive |
| Teal | `#00E5FF` | up / positive |
| Danger | `#E84040` | down / negative |
| Primary text | `#F0EDE8` | headings / body |
| Muted text | `#6B7280` | sub-labels |
| Positive alt | `#00C9A7` | teal alt |

**Never use** Tailwind CSS variable `var(--color-*)` — always hex literals. CSS variables don't resolve reliably in this setup.  
**Font**: `font-mono` for all data. `font-display` (Cormorant Garamond) for headings.

---

## What Was Built This Session

### 1. NSE Filings Page (`app/filings/page.tsx`)
- Categories reduced to: **All · Results · Corporate Actions · Annual Report · Investor Complaints · Insider Trading**  
- Removed: Board Meeting, IPO/DRHP, General tabs

### 2. `lib/nse-filings.ts` — Feed additions
Added two new RSS feeds (8 total now):

| Key | Feed URL | Category |
|---|---|---|
| `financialResults` | `Financial_Results.xml` | `results` |
| `boardMeetings` | `Board_Meetings.xml` | `board-meeting` |
| `insiderTrading` | `Insider_Trading.xml` | `insider-trade` |
| `offerDocuments` | `Offer_Documents.xml` | `ipo-drhp` |
| `announcements` | `Online_announcements.xml` | `general` |
| `corporateAction` | `Corporate_action.xml` | `corporate-action` ← was `"general"` |
| `annualReports` | `Annual_Report.xml` | `annual-report` ← NEW |
| `investorComplaints` | `Investor_Complaints.xml` | `investor-complaint` ← NEW |

**NSE RSS format changed**: Titles are now company names ("State Bank Of India"), not old "SYMBOL : Description" format.  
`scripCode = parsedSymbol || rawTitle` — company name is used as scripCode for alias matching.  
`extractFilingSubject()` pulls `|SUBJECT:` from RSS `<description>` field for useful description text.

### 3. `lib/bse-filings.ts` — FilingCategory type
```ts
export type FilingCategory =
  | "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general"
  | "corporate-action" | "annual-report" | "investor-complaint";
```

### 4. `components/ui/Badge.tsx` — New variant styles
Added: `corporate-action` (violet), `annual-report` (emerald), `investor-complaint` (orange)

### 5. `lib/nse-deals.ts` — `fetchAllDeals()` added
**Key insight**: `fetchBulkDeals()`, `fetchBlockDeals()`, `fetchShortDeals()` each open their own NSE session + snapshot = 3 round-trips. The snapshot returns all three types at once.

```ts
export async function fetchAllDeals(): Promise<{
  bulk: Deal[]; block: Deal[]; short: Deal[];
  asOnDate: string; fetchedAt: string;
}>
```

Both portfolio activity routes now use `fetchAllDeals()` — one NSE session for all three types.

### 6. `app/api/deals/route.ts` — Short selling price enrichment
Short positions from NSE have no price. Added Yahoo Finance v8 enrichment:
- **v7 batch endpoint broken** — requires crumb cookie, returns empty silently
- **Use v8/chart** per-symbol: `https://query1.finance.yahoo.com/v8/finance/chart/SYM.NS?interval=1d&range=1d`
- 15 concurrent requests per batch, 5-second `AbortSignal.timeout` per call
- `valueCr = quantity × price / 10_000_000`

### 7. Portfolio Page (`app/portfolio/page.tsx`)
- `localStorage` key: `portfolio_v1`
- **Never use `useEffect([portfolio])` to save** — fires on initial render with `[]`, wiping stored data. Use explicit `savePortfolio(next)` inside each mutation setter.
- `effectiveSymbol = searchFocused ? null : selected?.symbol ?? null` — shows general market view while search input is focused
- CSV import: detects column by header matching `symbol/ticker/scrip/nse/stock/equity/isin`
- Validates symbols against `/api/nse-symbols` with concurrency pool of 5

### 8. `app/api/portfolio/general/activity/route.ts`
Returns **typed deal arrays** (not merged):
```json
{
  "deals": {
    "bulk": [...],
    "block": [...],
    "short": [...],   // enriched with Yahoo Finance prices
    "fetchedAt": "..."
  }
}
```
Short deals enriched same as `/api/deals?tab=short`.

### 9. `app/api/portfolio/[symbol]/activity/route.ts`
Same `{ bulk, block, short }` structure. Short deals for the symbol enriched with a **single Yahoo Finance v8 call** (symbol already known).

**Company name matching** (`matchesFiling`): checks `scripCode` AND `company` fields against `SYMBOL_ALIASES` map (~45 stocks). Aliases ≥6 chars: substring match. Shorter: exact.  
**News matching** (`titleContainsTerm`): word-boundary check — char before/after term must not be `[A-Z0-9]` to prevent "RIL" ⊂ "APRIL".

### 10. `components/portfolio/PortfolioActivityPanel.tsx`
`ActivityData.deals` changed from `{ items: DealItem[] }` to:
```ts
deals: { bulk: DealItem[]; block: DealItem[]; short: DealItem[]; fetchedAt: string }
```
Tab filtering reads directly from the correct array — avoids the NSE date sort bug (see below).

### 11. `components/portfolio/ActivityColumn.tsx`
Added optional tab bar:
```ts
interface ActivityColumnProps {
  tabs?: ColumnTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}
```
NSE Filings tabs: All · Results · Corp. Action · Annual · Complaints · Insider  
Deals tabs: All · Bulk · Block · Short

---

## Known Bugs / Gotchas

### NSE Date Format
NSE returns dates as `"20-Apr-2026"`. `new Date("20-Apr-2026")` returns Invalid Date in Node.js (not ISO format). **Do not sort deals by date using `new Date(d.date).getTime()`** — all comparisons become NaN and sort order is undefined.  
Consequence: if you merge all deal types into one array and sort by date, order is arbitrary. The typed `{ bulk, block, short }` structure sidesteps this entirely.

### Block Deals
Block deals only execute in two NSE windows: **8:45–9:00 AM** and **2:05–2:20 PM**. Empty block deals at other times is correct, not a bug.

### NSE Session Blocking
`fetchSnapshot()` may return HTML instead of JSON if NSE's session/cookie flow fails. The code checks `text.trimStart().startsWith("<")` and returns empty arrays — safe fallback.

### Yahoo Finance v7 Batch API
`/v7/finance/quote?symbols=A.NS,B.NS,...` now requires a crumb cookie and silently returns empty without one. **Always use v8/chart** for price fetching in this codebase.

---

## File Map (modified this session)

```
lib/
  bse-filings.ts         FilingCategory type expanded
  nse-filings.ts         +2 feeds, corporateAction category fixed, extractFilingSubject()
  nse-deals.ts           fetchAllDeals() added

app/
  filings/page.tsx       CATEGORIES updated (5 streams only)
  api/
    deals/route.ts       Short tab: Yahoo Finance v8 price enrichment
    portfolio/
      general/activity/route.ts   fetchAllDeals, {bulk,block,short} response, enriches short
      [symbol]/activity/route.ts  fetchAllDeals, {bulk,block,short} response, enriches short

components/
  ui/Badge.tsx                    +3 new variant styles
  portfolio/
    ActivityColumn.tsx            optional tab bar added
    PortfolioActivityPanel.tsx    ActivityData.deals type updated, tab filtering
```

---

## Prompt for Next Session

Copy-paste this into a new Claude Code session (working directory: `D:\Sunidhi-Intranet-Futuristic`):

```
Read CONTEXT.md in the project root before anything else — it contains full session history and architectural decisions. This is the Sunidhi Research Intelligence Platform (Next.js 16, TypeScript, Tailwind). Continue development from where the previous session left off.

Key things to know:
- Always use hex color literals, never CSS variables
- Yahoo Finance: always use v8/chart endpoint, v7 batch is broken (requires crumb)
- NSE dates are "20-Apr-2026" format — not parseable by new Date() in Node.js
- ActivityData.deals is typed {bulk, block, short} — not a merged items array
- Use fetchAllDeals() from lib/nse-deals.ts for any route that needs all three deal types
- Run type check: npx tsc --noEmit -p tsconfig.json

[Describe your next task here]
```
