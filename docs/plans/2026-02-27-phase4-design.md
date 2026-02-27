# Phase 4 — Network Access, Ticker, Commodities, Logo, News Enhancement

**Date:** 2026-02-27
**Status:** Approved

---

## Overview

Five improvements to the Sunidhi Research Intelligence Platform:

1. **Network access** — expose the app on the LAN so colleagues can access it
2. **Ticker 10s refresh** — reduce TickerStrip poll interval from 60s → 10s
3. **Gold ₹ & Silver ₹ tiles** — add INR-denominated commodity prices to MetricsRow (Option A)
4. **Logo replacement** — replace the red "S" badge with the actual Sunidhi PNG
5. **News feed expansion** — add more Indian market RSS sources + auto-trigger fetch

---

## 1. Network Access

- **LAN IP:** `192.168.48.102`
- **URL for colleagues:** `http://192.168.48.102:3001`
- Next.js production server already binds to `0.0.0.0` by default — no code change needed
- Add Windows Firewall inbound rule for TCP port 3001 via `netsh`
- Verify with `curl http://192.168.48.102:3001` from local machine

---

## 2. Ticker 10s Refresh

**File:** `components/layout/TickerStrip.tsx`

- Change `setInterval(fetchQuotes, 60000)` → `setInterval(fetchQuotes, 10000)`
- The `/api/macro` backend route uses `next: { revalidate: 60 }` on Yahoo Finance fetches — multiple client polls will be served from Next.js cache, not hammering Yahoo
- No backend change needed

---

## 3. Gold ₹/10g + Silver ₹/kg Metric Tiles

### Backend — `lib/yahoo-finance.ts`

Add `SI=F` (COMEX Silver, USD/troy oz) to the SYMBOLS map.

After fetching all raw quotes, compute two derived virtual quotes:
- `GOLD_INR`: `GC=F price × INR=X rate × 10 / 31.1035` → label "Gold ₹/10g", symbol `GOLD_INR`
- `SILVER_INR`: `SI=F price × INR=X rate × 1000 / 31.1035` → label "Silver ₹/kg", symbol `SILVER_INR`

`fetchAllQuotes()` appends these two virtual entries after the real quotes. The `history` array for virtual quotes is derived from the GC=F or SI=F history × conversion factor.

### Frontend — `components/dashboard/MetricsRow.tsx`

- Change `quotes.slice(0, 5)` → `quotes.slice(0, 7)`
- Update grid: `grid-cols-5` → `grid-cols-7` (lg breakpoint)
- `formatPrice()`: add cases for `GOLD_INR` (toLocaleString, 0 decimals) and `SILVER_INR` (toLocaleString, 0 decimals)

### Frontend — `components/layout/TickerStrip.tsx`

- `formatPrice()`: same cases as above — GOLD_INR and SILVER_INR format with `₹` prefix and comma thousands

---

## 4. Logo Replacement

**File:** `components/layout/Sidebar.tsx`

The `Sunidhi_logo_homepage.png` already exists at `/public/images/Sunidhi_logo_homepage.png` and is shown when the sidebar is expanded.

In the **collapsed state**, replace the red `<div>` with "S" letter with a white-background pill showing the PNG, constrained to 32×32:
```tsx
<div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
  <img src="/images/Sunidhi_logo_homepage.png" alt="Sunidhi" className="w-7 h-7 object-contain" />
</div>
```

The expanded state already shows the logo correctly — no change needed there.

---

## 5. News Feed Expansion

**File:** `app/api/fetch-market-news/route.ts`

### New RSS feeds to add

| Source | Feed URL | Notes |
|--------|----------|-------|
| Moneycontrol Markets | `https://www.moneycontrol.com/rss/marketreports.xml` | Key Indian market source |
| Moneycontrol Business | `https://www.moneycontrol.com/rss/business.xml` | Corporate news |
| NDTV Profit | `https://www.ndtv.com/business/rss` | TV news, market-focused |
| BQ Prime | `https://www.bqprime.com/feeds/rss` | Bloomberg India |
| ET Markets (fix) | `https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms` | Already present, verify |
| Business Standard | `https://www.business-standard.com/rss/latest.rss` | Retry — may now work |
| Zee Business | `https://zeebiz.com/rss` | Hindi TV but English site |

### Source detection additions

Add to `detectSource()`:
- `moneycontrol.com` → "Moneycontrol"
- `ndtv.com` → "NDTV Profit"
- `bqprime.com` → "BQ Prime"
- `business-standard.com` → "Business Standard"
- `zeebiz.com` → "Zee Business"

### News badge additions

Update `SOURCE_BADGE_STYLE` in `NewsHeadlines.tsx`:
- `MC` (Moneycontrol) — already has orange style
- Add: `NDTV`, `BQ`, `BS`, `ZB` badge styles

### Auto-populate

The news store is populated by manually hitting `/api/fetch-market-news`. This should be triggered automatically on server start. Add a startup trigger in `app/api/market-news/route.ts` that calls fetch-market-news if the store has fewer than 50 items.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/yahoo-finance.ts` | Add SI=F; compute GOLD_INR and SILVER_INR virtual quotes |
| `components/dashboard/MetricsRow.tsx` | Slice 7, grid-cols-7, formatPrice for INR symbols |
| `components/layout/TickerStrip.tsx` | 10s interval; formatPrice for INR symbols |
| `components/layout/Sidebar.tsx` | Replace red S badge with PNG logo |
| `app/api/fetch-market-news/route.ts` | Add 6 new RSS feeds + source detection |
| `components/dashboard/NewsHeadlines.tsx` | Add new source badge styles |
| `app/api/market-news/route.ts` | Auto-populate trigger if store < 50 items |

---

## Out of Scope (Phase 5+)

- Dark/light theme for logo (logo is always on white bg pill — fine)
- MCX direct feed (Yahoo Finance has sufficient commodity data)
- Scheduled server-side news polling (cron/background job)
