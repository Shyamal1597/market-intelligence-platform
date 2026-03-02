# FII/DII Flow Tracker — Design

**Date:** 2026-03-02
**Status:** Approved
**Phase:** ROADMAP Phase 4 (Advanced Intelligence) — Tranche 2

---

## Scope

New page `/flows` — institutional equity & debt flow tracker showing FII and DII activity
separately across a 1-year window. Live fetch from NSE on every page load (no persistence).

---

## Data Source

**Today's snapshot:** `https://www.nseindia.com/api/fiidiiTradeReact`
Returns today's FII and DII buy/sell/net for Equity and Debt segments.

**Historical (1 year):** `https://www.nseindia.com/api/historicaldata-fiiDii?from=DD-Mon-YYYY&to=DD-Mon-YYYY`
Returns array of daily entries covering the requested date range.

Both endpoints require NSE headers (same pattern as `lib/bse-calendar.ts`):
```ts
const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 ...",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
};
```

Cache: `force-dynamic` — no revalidate, fresh on every request.

---

## Data Shape

```ts
// lib/nse-flows.ts

export interface FiiDiiEntry {
  date: string;            // "YYYY-MM-DD"

  // Equity segment
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;

  // Debt segment
  fiiDebtBuy: number;
  fiiDebtSell: number;
  fiiDebtNet: number;
  diiDebtBuy: number;
  diiDebtSell: number;
  diiDebtNet: number;

  // Derived (computed in lib after sorting ascending)
  cumulativeFiiEquityNet: number;   // running sum of fiiEquityNet
  cumulativeDiiEquityNet: number;   // running sum of diiEquityNet
  rollingAvg20FiiEquity: number;    // 20-day rolling average of fiiEquityNet
  rollingAvg20DiiEquity: number;    // 20-day rolling average of diiEquityNet
}
```

Derived fields are computed in `lib/nse-flows.ts` after sorting entries ascending by date.
The rolling average uses a simple window average over the prior 20 entries (or however many
exist if fewer than 20 have accumulated).

---

## New Files

| File | Purpose |
|------|---------|
| `lib/nse-flows.ts` | NSE fetcher + parser + derived field computation |
| `app/api/flows/route.ts` | API route, serves merged entries |
| `app/flows/page.tsx` | Page component with charts and summary |
| `components/flows/FlowSnapshotCard.tsx` | Today's snapshot card (FII/DII × Equity/Debt) |
| `components/flows/FlowChart.tsx` | ComposedChart with bars + cumulative + rolling avg |
| `components/flows/FlowSummaryStrip.tsx` | MTD/QTD/YTD + streak + top flow days |

---

## UI Layout

### Header
```
FII/DII Flows                                    [LIVE ●]
Institutional equity & debt flows · NSE data · 1-year view
```

### Snapshot Row (4 cards)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ FII EQUITY   │ │ DII EQUITY   │ │ FII DEBT     │ │ DII DEBT     │
│ NET TODAY    │ │ NET TODAY    │ │ NET TODAY    │ │ NET TODAY    │
│ +₹4,231 Cr  │ │ -₹1,820 Cr  │ │ -₹812 Cr    │ │ +₹620 Cr    │
│ B 12,450     │ │ B 8,100      │ B 3,100       │ │ B 2,400      │
│ S  8,219     │ │ S 9,920      │ S 3,912       │ │ S 1,780      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```
- Card background: teal/10 if net positive, danger/10 if net negative
- Numbers: JetBrains Mono
- Net value large, buy/sell small below

### Chart Controls
```
[EQUITY]  [DEBT]        [FII]  [DII]  [FII vs DII]
```
Two independent toggle groups:
- **Segment toggle** (Equity / Debt) — which segment's data to plot
- **Entity toggle** (FII / DII / FII vs DII) — whose data, or overlay both

FII vs DII view overlays both entities on the same axis to show the counter-cyclical offset.

### Chart (Recharts ComposedChart)
- **Bars:** daily net, coloured by sign (teal positive, danger negative)
- **Line 1:** cumulative net — amber `#F5820D`, 2px, right Y-axis
- **Line 2:** 20-day rolling average — white at 60% opacity, 1.5px, left Y-axis
- **Line 3:** Nifty 50 normalised to the net scale — purple `#8B5CF6` at 40% opacity,
  right Y-axis, only shown in single-entity views (hidden in FII vs DII to avoid clutter)
- Tooltip: date, daily net, cumulative, rolling avg, Nifty close
- X-axis: monthly ticks, JetBrains Mono
- Dual Y-axis: left (daily bars + rolling avg), right (cumulative + Nifty)
- No animation

### Summary Strip
```
MTD Net  +₹8,420 Cr  ·  QTD Net  -₹3,100 Cr  ·  YTD Net  -₹12,340 Cr
Net Buyer 142 days  ·  Net Seller 108 days  ·  Current streak: 4 days net buyer
```
- All values computed client-side from the entries array
- Streak: count consecutive days from most recent where sign is consistent

### Top Flow Days
Two rows of the 5 biggest single-day inflows and 5 biggest outflows (for the currently
selected segment + entity):
```
Biggest inflows:   15 Jan +₹8,200 Cr  ·  3 Mar +₹6,100 Cr  ·  ...
Biggest outflows:  22 Oct -₹9,400 Cr  ·  7 Aug -₹7,800 Cr  ·  ...
```
- JetBrains Mono, small
- Teal for inflows, danger for outflows

### Sidebar Entry
```ts
{ href: "/flows", icon: TrendingUp, label: "Flows" }
```
Inserted between Sectors and Quick Links in `Sidebar.tsx`.

---

## Error Handling

- If NSE historical endpoint fails: show error banner, retain any partial data
- If today's snapshot fails: snapshot cards show `—` values, chart still renders from history
- If all data fails: full error state with retry button (manual page reload)
- Individual entry parse failures: skip silently, do not fail the whole response

---

## Loading State

- Skeleton for 4 snapshot cards
- Skeleton chart area (flat rectangle, animate-pulse)
- Summary strip hidden until data loads

---

## Non-Goals

- No per-stock FII holding data (would require separate SEBI/NSDL source)
- No push alerts for large single-day flows
- No persistence / historical archive beyond what NSE returns in one call
- No Debt chart for Nifty overlay (Nifty correlation is equity-specific)
