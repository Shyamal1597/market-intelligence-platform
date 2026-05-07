# NSE RSS Feed — Company Search Implementation

**Date:** April 2026  
**Feature:** Cross-stream company search with NSE 500 alias expansion

---

## Overview

The NSE RSS Feeds page (`/markets/nse-rss`) aggregates 13 live NSE RSS feed streams. Before this feature, users could only browse feeds one tab at a time. The search feature allows a user to type a company name or NSE ticker symbol and instantly see matching results across **all 13 feed streams simultaneously**.

---

## Problem Statement

1. **Fragmented browsing** — users had to click through 13 tabs to find announcements for a single company.
2. **Abbreviation mismatch** — NSE RSS titles use full registered company names (e.g., "STATE BANK OF INDIA"), but users naturally type short-forms ("SBI"). A plain text search would return no results.
3. **Truncated data** — the API was fetching only 10 items per feed and doing so sequentially (one feed at a time), making the page slow and incomplete.

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `src/app/markets/nse-rss/page.tsx` | Modified | Search UI, search results view, alias import |
| `src/app/api/nse-feeds/route.ts` | Modified | Parallel fetching, removed 10-item cap |
| `src/lib/nse-aliases.ts` | **New file** | NSE 500 company alias map + `expandSearch()` |

---

## Implementation

### 1. API — Parallel Fetching & Full Item Count (`src/app/api/nse-feeds/route.ts`)

**Before:** feeds were fetched sequentially in a `for` loop with a hard cap of 10 items per feed.

```typescript
// BEFORE — sequential, capped at 10
for (const [key, url] of Object.entries(NSE_RSS_FEEDS)) {
  const feed = await parser.parseURL(url);
  const items = feed.items.slice(0, 10).map(...);
}
```

**After:** all 13 feeds are fetched in parallel using `Promise.all`, and all items the XML returns are included (no slice).

```typescript
// AFTER — parallel, all items
const results = await Promise.all(
  entries.map(async ([key, url]) => {
    const feed = await parser.parseURL(url);
    const items = feed.items.map((item, index) => ({ ... }));
    return [key, { name, items, count: items.length }] as const;
  })
);
const allFeeds = Object.fromEntries(results);
```

**Impact:** page load time reduced significantly (13 sequential HTTP requests → 13 concurrent). Full feed contents now visible instead of just the first 10.

---

### 2. Alias Map (`src/lib/nse-aliases.ts`)

A standalone TypeScript module mapping ticker symbols and common abbreviations to the search terms that actually appear in NSE RSS feed titles.

**Structure:**

```typescript
export const COMPANY_ALIASES: Record<string, string[]> = {
  // key: what the user types (lowercase)
  // values: substrings to match against feed title/content (OR logic)
  sbi:      ["state bank of india", "sbi"],
  tcs:      ["tata consultancy", "tcs"],
  infy:     ["infosys", "infy"],
  "l&t":    ["larsen", "l&t"],
  // ... 400+ entries covering NSE 500
};
```

**`expandSearch()` function:**

```typescript
export function expandSearch(raw: string): string[] {
  const term = raw.trim().toLowerCase();
  const aliases = COMPANY_ALIASES[term];
  // Always include the original term + any alias expansions
  return aliases ? [...new Set([term, ...aliases])] : [term];
}
```

**Coverage by sector:**

| Sector | Examples |
|---|---|
| Nifty 50 | RELIANCE, TCS, HDFC, SBI, INFY, ICICI, L&T, HUL |
| Banking (PSU & Private) | PNB, BOB, BOI, CANARA, UNION, INDUSIND, FEDERAL, IDFC, BANDHAN, RBL, YES |
| IT & Tech | MPHASIS, COFORGE, LTTS, PERSISTENT, HEXAWARE, CYIENT, KPIT, TATAELXSI |
| Pharma | AUROPHARMA, LUPIN, TORNTPHARM, ALKEM, ABBOTT, GLENMARK, BIOCON, ZYDUS |
| Auto & Ancillaries | ASHOKLEY, TVSMOTOR, BALKRISIND, MOTHERSON, APOLLOTYRE, MRF, CEAT, BOSCH |
| FMCG | COLPAL, EMAMI, VARUNBEV, JUBLFOOD, DABUR, MARICO, GODREJCP |
| Chemicals | DEEPAKNIS, NAVINFLUOR, AARTI, VINATI, PIDILITE, TATACHEM, COROMANDEL |
| Infra & Real Estate | DLF, GODREJPROP, OBEROIRLTY, PRESTIGE, LODHA, PHOENIXLTD |
| Power & Energy | TATAPOWER, ADANIPOWER, TORNTPOWER, NHPC, SJVN, JSWENERGY |
| Oil & Gas | IOC, MGL, IGL, GUJGASLTD, PETRONET, CASTROL |
| Metals & Mining | VEDL, NMDC, NALCO, HINDCOPPER, SAIL, JSPL, TATASTEEL, JSWSTEEL |
| Cement | JKCEMENT, RAMCOCEM, DALMIACEM, SHREECEM, AMBUJACEM, ULTRACEMCO |
| Insurance | LIC, STARHEALTH, GODIGIT, NIACL, SBILIFE, HDFCLIFE, ICICIPRU |
| Finance / NBFC | BAJFINANCE, CHOLAFIN, SHRIRAMFIN, LICHSGFIN, MANAPPURAM, ANGELONE |
| Railways & Defence | IRFC, IRCTC, RVNL, BEL, HAL, BEML, GRSE, COCHINSHIP |
| Telecom & Media | BHARTIARTL, VODAFONE, ZEEL, SUNTV, PVRINOX |
| Consumer Durables | VOLTAS, BLUESTAR, HAVELLS, DIXON, KAJARIA, CROMPTON |
| Hospitality & Travel | IHCL, EIH, LEMON, INTERGLOBE (IndiGo), SPICEJET |

**How to add a new alias:**

Open `src/lib/nse-aliases.ts` and add an entry:

```typescript
newcompany:   ["full registered name as it appears in nse title"],
nse_ticker:   ["full registered name", "short form"],
```

Rules:
- Keys must be lowercase
- Keys starting with a digit must be quoted (e.g., `"360one"`)
- No duplicate keys — TypeScript will throw a build error
- Values are matched as substrings (case-insensitive) against the full `title + content` of each feed item

---

### 3. Search UI (`src/app/markets/nse-rss/page.tsx`)

#### State added

```typescript
const [searchTerm, setSearchTerm] = useState("");
```

#### Search results computation

```typescript
const searchResults = useMemo(() => {
  if (!searchTerm.trim()) return null;
  const terms = expandSearch(searchTerm); // original + alias expansions
  return RSS_FEEDS.flatMap((feedConfig) => {
    const items = (feeds[feedConfig.key]?.items ?? []).filter((item) => {
      const haystack = (item.title + " " + (item.content ?? "")).toLowerCase();
      return terms.some((t) => haystack.includes(t));
    });
    return items.length > 0 ? [{ feedConfig, items }] : [];
  });
}, [searchTerm, feeds]);
```

`searchResults` is `null` when the search box is empty (shows normal tab view) and an array when a term is entered (shows grouped results view).

#### UI behaviour

| State | What user sees |
|---|---|
| Empty search box | Normal 13-tab feed view |
| Typing a company name | Search results view — results grouped by feed type |
| No matches found | Empty state with suggestion to check spelling |
| "Clear" button / backspace to empty | Returns to tab view |

#### Search bar placement

The search bar sits inside the hero section, below the Refresh button, styled as a semi-transparent panel:

```tsx
<div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 max-w-2xl mx-auto w-full">
  <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-3">
    Search across all feeds
  </p>
  <div className="flex gap-3">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="text"
        placeholder="Company name, e.g. Reliance, Infosys…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-white text-gray-900 ..."
      />
    </div>
    {searchTerm && (
      <button onClick={() => setSearchTerm("")}>
        <X /> Clear
      </button>
    )}
  </div>
</div>
```

---

## Search Logic Flow

```
User types "SBI"
        │
        ▼
expandSearch("sbi")
        │
        ▼
["sbi", "state bank of india"]   ← original + alias
        │
        ▼
For each of 13 feeds:
  filter items where title+content contains "sbi" OR "state bank of india"
        │
        ▼
Group results by feed type
  [{ feedConfig: Announcements, items: [...] },
   { feedConfig: Board Meetings, items: [...] }, ...]
        │
        ▼
Render grouped results with feed icon, count badge, and View buttons
```

---

## Example Alias Lookups

| User types | Expanded to | Matches in NSE titles |
|---|---|---|
| `SBI` | `["sbi", "state bank of india"]` | "STATE BANK OF INDIA has informed..." |
| `TCS` | `["tcs", "tata consultancy"]` | "TATA CONSULTANCY SERVICES LTD" |
| `L&T` | `["l&t", "larsen"]` | "LARSEN AND TOUBRO LIMITED" |
| `INFY` | `["infy", "infosys"]` | "INFOSYS LIMITED" |
| `HUL` | `["hul", "hindustan unilever"]` | "HINDUSTAN UNILEVER LIMITED" |
| `Reliance` | `["reliance industries", "ril", "reliance"]` | "RELIANCE INDUSTRIES LIMITED" |
| `BPCL` | `["bpcl", "bharat petroleum"]` | "BHARAT PETROLEUM CORPORATION" |

---

## Maintenance Notes

- The alias file is purely client-side — no API changes needed when adding aliases.
- TypeScript enforces no duplicate keys at build time.
- The `expandSearch` function is exported from `src/lib/nse-aliases.ts` and can be reused on other pages that search NSE data.
- If NSE changes a company's registered name (e.g., after a merger), update the value array in the alias map — the key (ticker) can stay the same.

---

*Document prepared by: Development Team*  
*Date: April 2026*
