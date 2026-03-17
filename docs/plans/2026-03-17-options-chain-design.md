# Options Chain Page — Design Document
_2026-03-17_

## Overview

Build a full-featured options chain page at `/derivatives` in the `futuristic-design` branch (`D:\Sunidhi-Intranet-Futuristic\`). Modelled on Sensibull's chain UI, styled to Project NEBULA's Bloomberg-terminal aesthetic.

## Scope

- **Symbols**: any NSE symbol via free-form search (validated against NSE contract-info endpoint); NIFTY and BANKNIFTY as pinned defaults
- **Tabs**: Chain, Volatility (Strategy builder and finder deferred)
- **Columns**: configurable show/hide with localStorage persistence
- **OI/Volume bars**: switchable toggle per session

---

## Architecture

### New Files

**API / lib:**
```
lib/nse-derivatives.ts                         ← ported from awesome-chaplygin branch
app/api/option-chain/route.ts                  ← GET ?symbol=&expiry=  → chain data
app/api/option-chain/expiries/route.ts         ← GET ?symbol=          → expiry list
```

**Page / components:**
```
app/derivatives/page.tsx
components/derivatives/OptionChainPage.tsx     ← root client component, all state
components/derivatives/SymbolSearch.tsx        ← free-form NSE symbol input + validation
components/derivatives/ExpiryStrip.tsx         ← horizontal scrollable expiry picker
components/derivatives/ChainSummary.tsx        ← spot / ATM IV / PCR / Max Pain strip
components/derivatives/OptionChainTable.tsx    ← full chain table
components/derivatives/ChainRow.tsx            ← single calls/strike/puts row
components/derivatives/ColumnToggle.tsx        ← show/hide columns popover (gear icon)
components/derivatives/VolatilityChart.tsx     ← IV skew chart (Recharts)
```

---

## Data Flow

### Symbol → Chain Fetch Sequence
1. User types symbol → 400ms debounce → validate via `GET /api/option-chain/expiries?symbol=X`
2. Empty expiry list = invalid symbol → show error state
3. Valid → auto-select nearest expiry → `GET /api/option-chain?symbol=X&expiry=DD-Mon-YYYY`
4. Response shape:
```ts
{
  spot: number;
  expiries: string[];
  records: Array<{
    strikePrice: number;
    expiryDate: string;
    CE?: OptionLeg;
    PE?: OptionLeg;
  }>;
  totals: { callOI: number; putOI: number; PCR: number; maxPain: number };
}

interface OptionLeg {
  openInterest: number;
  changeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  lastPrice: number;
  askPrice: number;
  bidPrice: number;
  delta: number; gamma: number; theta: number; vega: number; rho: number;
}
```

### NSE API (two-step, no nseappid needed)
1. `GET /option-chain` (HTML) → extract `nsit` cookie
2. `GET /api/option-chain-contract-info?symbol=X` → expiry dates
3. `GET /api/option-chain-v3?type=Indices|Equity&symbol=X&expiry=DD-Mon-YYYY` → full chain

### Auto-Refresh
- 30-second `setInterval`, paused outside 09:15–15:30 IST
- Paused when `document.hidden` (tab not visible), resumed on focus
- Countdown displayed in header ("↻ 28s")
- Manual refresh button resets countdown
- Session cookie refreshed automatically on expiry error

---

## UI Design

### Header
```
[🔍 NIFTY ▾]  [Chain] [Volatility]          [OI | Vol]  [⚙ Columns]  [↻ 28s]
```

### Expiry Strip
- Horizontally scrollable pill buttons
- Month labels above groups
- Active pill: amber background, amber border
- Nearest expiry auto-selected on load

### Summary Strip
```
Spot 23,504  ·  ATM IV 13.9%  ·  PCR 1.13  ·  Max Pain 23,500  ·  OPEN ●
```

### Chain Table

**Calls (left) | Strike (center, fixed) | Puts (right)**

Default visible columns (matching screenshot):
- Calls: `Theta · Gamma · Delta · LTP · Ask · Bid · [OI/Vol bar]`
- Strike: strike price, ATM gets amber label + spot tooltip
- Puts: `[OI/Vol bar] · Bid · Ask · LTP · Delta · Gamma · Theta · Vega · Rho`

All available columns (toggleable):
- Greeks: Delta, Gamma, Theta, Vega, Rho
- Price: LTP, Ask, Bid
- OI: OI, OI Change, Volume (bar always shown in default)
- Misc: IV%, Time

**Row styling:**
- ITM calls (left side): diagonal stripe overlay `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 6px)`
- ITM puts (right side): same stripe
- ATM row: subtle `border-y border-amber/20`
- Hover: `bg-white/[0.03]`
- Font: `JetBrains Mono`, ~32px row height, dense

**OI/Volume bars:**
- Absolute-positioned within the bar cell
- Scaled to max OI/Volume in visible strikes (±20 strikes from ATM)
- Calls: `bg-cyan-500/40` (blue)
- Puts: `bg-red-500/40` (red)
- Toggle button in header switches numeric + bar between OI and Volume

### Volatility Tab
- `Recharts LineChart`
- X axis: strike prices
- Y axis: IV%
- Call IV line: `#38BDF8` (blue)
- Put IV line: `#F87171` (red)
- ATM strike: vertical `ReferenceLine` in amber
- Same expiry selector as chain tab

### Column Configurator
- Gear icon → popover with grouped checkboxes: Greeks / Price / OI & Volume
- Minimum always-visible: LTP (both sides), Strike
- Saved to `localStorage` key `nebula:options:columns`

---

## Error States
- Invalid symbol: "No option chain found for XYZ" below search input
- NSE session failure: retry button, "NSE session expired — click to retry"
- Market closed: chain still shows last data with "Market closed" badge, no auto-refresh

---

## Out of Scope (this iteration)
- Strategy builder
- Strategy finder
- Breeze WebSocket live quotes (30s NSE polling is sufficient)
- Historical OI charts
