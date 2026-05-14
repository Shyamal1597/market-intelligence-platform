# Bug Fixes & Improvements Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all reported bugs and UX issues across the platform — portfolio page, stock detail, NSE filings, macro data, dashboard, market news, and font sizes.

**Architecture:** All fixes are independent, scoped to individual pages/components. No shared state changes between tasks. Each can be tested in isolation.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Lucide React

---

### Task 1: Remove Smart Money Widget from Dashboard

The Smart Money Signal widget depends on a local Ollama LLM (llama3.1:8b) that isn't running. Remove it from the dashboard.

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/dashboard/DashboardShell.tsx`

**Steps:**

1. In `app/page.tsx`:
   - Remove the `SmartMoneyWidget` import (line 7)
   - Remove `smartmoney: <SmartMoneyWidget />` from the children object (line 15)

2. In `components/dashboard/DashboardShell.tsx`:
   - Remove the `smartmoney` entry from `DEFAULT_WIDGETS` array (line 49):
     ```typescript
     { id: "smartmoney",  label: "Smart Money Signals",  visible: true, size: "normal", width: "full" },
     ```

3. Verify: Run `npx tsc --noEmit` — zero errors.

4. Commit: `git commit -m "remove: smart money widget from dashboard (requires local Ollama)"`

---

### Task 2: Fix Market News Auto-Update

The news page reads from `/api/market-news` which only serves cached JSON from `data/market-news.json`. It never triggers `/api/fetch-market-news` to pull fresh RSS feeds unless the store has <50 items. The client polls every 10min but only re-reads the same stale file.

**Files:**
- Modify: `app/api/market-news/route.ts`

**Steps:**

1. In the GET handler of `app/api/market-news/route.ts`, add a staleness check: if `market-news.json` was last modified >10 minutes ago, fire-and-forget a call to `/api/fetch-market-news` before returning the cached data. This ensures RSS feeds are periodically refreshed without blocking the response.

   After the existing auto-populate block (around line 149-151), add:
   ```typescript
   // Auto-refresh if store is stale (>10 min old)
   try {
     const stat = await import("fs/promises").then(f => f.stat(NEWS_FILE));
     const ageMs = Date.now() - stat.mtimeMs;
     if (ageMs > 10 * 60 * 1000) {
       fetch(`${request.nextUrl.origin}/api/fetch-market-news`).catch(() => {});
     }
   } catch {}
   ```

2. Fix the UI label mismatch in `app/news/page.tsx`: change "auto-refreshes every 30 min" to "auto-refreshes every 10 min" (line 98).

3. Verify: Visit `/news`, check that `data/market-news.json` mtime updates after 10 minutes.

4. Commit: `git commit -m "fix: trigger RSS feed refresh when market news data is stale"`

---

### Task 3: Add Cross-Stream Search Bar to NSE Filings Page

Port the search pattern from `sunidhi-nextjs` (documented in `NSE_RSS_SEARCH_IMPLEMENTATION.md`). The current filings page only has category filter buttons. Add a company search input with alias expansion that filters across all filings by company name/ticker.

**Files:**
- Create: `lib/nse-aliases.ts` — copy from `C:\Users\SSFL-RETAIL-017\sunidhi-nextjs\src\lib\nse-aliases.ts` (500+ company alias map + `expandSearch()` function)
- Modify: `app/filings/page.tsx` — add search input, `useMemo` filter with `expandSearch()`

**Steps:**

1. Copy the nse-aliases file:
   - Copy `C:\Users\SSFL-RETAIL-017\sunidhi-nextjs\src\lib\nse-aliases.ts` → `D:\Sunidhi-Intranet-Futuristic\lib\nse-aliases.ts`

2. In `app/filings/page.tsx`:
   - Add `useMemo` import, `Search, X` from lucide-react
   - Add `import { expandSearch } from "@/lib/nse-aliases"`
   - Add `const [searchTerm, setSearchTerm] = useState("")`
   - Add `useMemo` search filter:
     ```typescript
     const searchFiltered = useMemo(() => {
       if (!searchTerm.trim()) return null;
       const terms = expandSearch(searchTerm);
       return filings.filter((f) => {
         const haystack = (f.company + " " + f.scripCode + " " + f.description).toLowerCase();
         return terms.some((t) => haystack.includes(t));
       });
     }, [searchTerm, filings]);
     ```
   - Apply: `const visible = searchFiltered ?? (filter === "all" ? filings : filings.filter(...))`
   - Add search input above category buttons with clear button
   - Show result count when searching: `N results for "query"`

3. Verify: Visit `/filings`, type "sbi" → should show State Bank filings. Type "reliance" → Reliance filings. Clear → back to normal view.

4. Commit: `git commit -m "feat: add company search with alias expansion to NSE filings page"`

---

### Task 4: Update Stale Macro Data

The macro page has hardcoded India and Global macro values from Feb 2025. Replace hardcoded static cards with a note directing users to live sources, or update the values.

**Files:**
- Modify: `app/macro/page.tsx`

**Steps:**

1. Update the `INDIA_MACRO` array (line 16-20) with current May 2026 values:
   ```typescript
   const INDIA_MACRO = [
     { label: "RBI Repo Rate", value: "5.50%", note: "As of May 2026" },
     { label: "CPI Inflation", value: "3.16%", note: "Apr 2026" },
     { label: "IIP Growth", value: "4.2%", note: "Mar 2026" },
   ];
   ```
   Note: Verify current values from RBI website / MOSPI before hardcoding. If uncertain, add a disclaimer note on the card: "Manual update — verify on source".

2. Update `GLOBAL_MACRO` array (line 22-26):
   ```typescript
   const GLOBAL_MACRO = [
     { label: "US 10Y Yield", value: "—", note: "Update from FRED" },
     { label: "DXY (Dollar Index)", value: "—", note: "Update from Bloomberg" },
     { label: "CBOE VIX", value: "—", note: "Update from CBOE" },
   ];
   ```
   These should ideally be fetched live. For now, mark them as requiring manual update.

3. **Better long-term fix**: Add these as Yahoo Finance symbols to the `LIVE_GROUPS` so they auto-update:
   ```typescript
   const LIVE_GROUPS: Record<string, string[]> = {
     India:       ["^NSEI", "^BSESN", "^NSEBANK", "^INDIAVIX"],
     Commodities: ["BZ=F", "GOLD_INR", "SILVER_INR"],
     FX:          ["INR=X"],
     Global:      ["^TNX", "DX-Y.NYB", "^VIX"],  // US 10Y, DXY, VIX
   };
   ```
   Then remove the `GLOBAL_MACRO` static array entirely and let the live terminal handle it.

4. Verify: Visit `/macro`, confirm no stale "Feb 2025" dates, Global section shows live data.

5. Commit: `git commit -m "fix: update stale macro data, add global indicators to live feed"`

---

### Task 5: Fix Portfolio Page

The portfolio page uses `fixed inset-0 z-10` positioning which overlaps the sidebar/topbar layout. It also stores portfolio in localStorage — if the user hasn't added any stocks, it shows an empty state.

**Files:**
- Modify: `app/portfolio/page.tsx`
- Potentially modify: `components/portfolio/PortfolioSidebar.tsx`
- Potentially modify: `components/portfolio/PortfolioActivityPanel.tsx`

**Steps:**

1. Investigate the actual rendering issue by viewing the page in browser. The `fixed inset-0 z-10` on line 15 of `app/portfolio/page.tsx` will cover the entire viewport including the app sidebar. Change to:
   ```tsx
   <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-base">
   ```
   This respects the top bar height and doesn't overlay the main layout.

2. Check if the portfolio API routes (`/api/portfolio/[symbol]/activity` and `/api/portfolio/general/activity`) return proper data. If the general activity endpoint fails, the panel will show a loading spinner forever.

3. Add error handling in `PortfolioActivityPanel` — if the fetch fails, show an error state instead of infinite loading.

4. Verify: Visit `/portfolio`, confirm the page renders within the app layout (sidebar visible), the general activity feed loads on first visit.

5. Commit: `git commit -m "fix: portfolio page layout and error handling"`

---

### Task 6: Fix Stock Detail / Research Page

The research page falls back to a generic placeholder when a symbol isn't in the watchlist. Sub-panels (QuarterlyResults, Shareholding, News, Filings, Reports) fetch their own data per-symbol but may not have data for all stocks.

**Files:**
- Modify: `app/research/[symbol]/page.tsx`
- Potentially modify: `components/research/CompanyHeader.tsx`

**Steps:**

1. View the research page for a watchlist stock (e.g., `/research/HDFCBANK`) and a non-watchlist stock to identify what's actually broken.

2. The fallback creates a minimal `WatchlistEntry` with empty strings for `bseCode`, `sector`, `analyst`, `rating`. Check if `CompanyHeader` handles these empty fields gracefully — it likely shows blank sections or broken layouts for empty data.

3. If the issue is that company-specific panels (QuarterlyResults, Shareholding) don't populate: these depend on `entry.bseCode` for BSE API calls. Without a valid BSE code, they return empty. Add "No data available" fallback states in each panel when the API returns empty/error.

4. Verify: Visit `/research/HDFCBANK` and `/research/RELIANCE` — both should show available data or clean empty states.

5. Commit: `git commit -m "fix: research page graceful fallback for missing company data"`

---

### Task 7: Increase Base Font Size for Readability

Current base font is 15px. Users with older eyes need larger text. The existing CSS already overrides tiny font sizes (9-11px → 11-13px). Increase the baseline.

**Files:**
- Modify: `app/globals.css`

**Steps:**

1. Change `body { font-size: 15px; }` to `body { font-size: 16px; }` (line 123 of globals.css).

2. Update the tiny-font override rules to bump by 1px each:
   ```css
   .text-\[8px\]  { font-size: 11.5px !important; }
   .text-\[9px\]  { font-size: 12px !important; }
   .text-\[10px\] { font-size: 13px !important; }
   .text-\[11px\] { font-size: 14px !important; }
   ```

3. Check Tailwind's `text-xs` (12px) and `text-sm` (14px) — these are the most commonly used sizes. Consider adding global overrides:
   ```css
   .text-xs { font-size: 13px !important; }
   ```
   Only do this if the 12px text is genuinely hard to read at multiple places.

4. Verify: Browse multiple pages, confirm text is readable without breaking layouts (tables, badges, status bars).

5. Commit: `git commit -m "style: increase base font size for readability"`

---

### Task 8: Dashboard Redesign (Brainstorming Phase)

The dashboard needs a thorough redesign — more interactive, informative, customizable. The current layout is a basic widget grid.

**This task requires the brainstorming superpower** — use `superpowers:brainstorming` to explore design ideas, search for cool financial dashboard designs, and iterate with the user before implementing.

**Scope of brainstorming:**
- What data should the dashboard surface? (Market overview, portfolio performance, recent filings, earnings calendar, concall tracker summary)
- Layout paradigm: Bloomberg-style dense terminal? Card-based with drill-down? Bento grid?
- Interactivity: Click-through to detail pages? Inline charts? Real-time streaming?
- Customization: Current drag-and-drop is good. What else? Theme? Data sources?
- Mobile/tablet considerations?

**Do NOT implement until brainstorming produces an approved design.**

---

## Execution Order

Tasks 1–7 are independent and can be done in any order. Recommended sequence:

1. **Task 1** (Remove Smart Money) — 2 min, removes broken widget
2. **Task 2** (News Auto-Update) — 5 min, fixes stale data
3. **Task 3** (Filings Search) — 10 min, new feature
4. **Task 4** (Macro Data) — 10 min, fixes stale data
5. **Task 5** (Portfolio Page) — 15 min, layout fix + error handling
6. **Task 6** (Research Page) — 15 min, needs investigation
7. **Task 7** (Font Size) — 5 min, global CSS change
8. **Task 8** (Dashboard Redesign) — brainstorming session, separate from bug fixes

## Verification

After all tasks 1–7:
- `npx tsc --noEmit` — zero errors
- Visit each page: `/`, `/news`, `/filings`, `/macro`, `/portfolio`, `/research/HDFCBANK`
- Confirm no console errors, layouts render correctly, data loads
