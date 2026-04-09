# Smart Money Widget — Enriched Streams & In-Depth Insights

**Date:** 2026-04-09  
**Status:** Approved  
**Scope:** `lib/smart-money.ts`, `app/api/smart-money/[symbol]/route.ts`, `components/dashboard/SmartMoneyWidget.tsx`

---

## Problem

Two distinct failures in the current widget:

1. **Weak LLM insights** — Ollama receives thin data: news titles only (no content), FII/DII net-only (no buy/sell breakdown), deal flow as aggregate totals (no institution names). The model writes generic hedged sentences because it has nothing specific to cite.

2. **Invisible stream detail** — The scorecard table shows one truncated line per stream. Raw data exists in the API response but is never rendered beyond that single fact.

---

## Design

### Section 1 — Data Layer (Prompt Enrichment)

#### FII/DII Buy/Sell Breakdown

Add `fiiEquityBuy`, `fiiEquitySell`, `diiEquityBuy`, `diiEquitySell` to `FiiDiiDay` type.
These fields already exist in `fii-dii-history.json` — they are just not being passed through.

Prompt format changes from:
```
Apr 8: FII -3295Cr | DII +8593Cr
```
to:
```
Apr 8: FII bought ₹12,737Cr / sold ₹16,032Cr → net -₹3,295Cr | DII bought ₹21,110Cr / sold ₹12,516Cr → net +₹8,593Cr
```

#### News Content Snippets

Add `content` field to `NewsHeadline` type. `getRecentNews()` maps the persisted `content` field (already stored in `market-news.json`).

Pass top 5 news items with title + 200-char content snippet to both market and symbol prompts.

#### Individual Deal Rows

Add `topDeals` array to `MarketStreamData`:
```typescript
topDeals: { institution: string; side: string; symbol: string; valueCr: number }[]
```

`buildMarketData()` passes top 10 individual deals alongside the existing aggregate stats.

Prompt includes both:
- Aggregate: `"12 deals | Net +₹28Cr"`
- Top deals list: `"[HDFC MF] BUY RELIANCE ₹42Cr | [SBI Life] SELL ADANI ₹18Cr…"`

#### Temperature

Raise Ollama temperature from `0.3` to `0.45`. At 0.3 the model defaults to hedged language even when data is clear.

---

### Section 2 — UI Layout (Stream Sections)

Replace the compact scorecard table with 4 always-visible `StreamSection` blocks stacked vertically inside each `SignalCard`.

#### StreamSection anatomy

```
┌─────────────────────────────────────────────────────────┐
│  🟢  FII / DII FLOWS                        BULLISH ▸   │  header
├─────────────────────────────────────────────────────────┤
│  DATE        FII NET        DII NET                      │  raw data rows
│  Apr 8       -₹3,295Cr     +₹8,593Cr                   │
│  Apr 7       -₹8,752Cr     +₹12,068Cr                  │
│  7d total    FII -₹22kCr   DII +₹48kCr                 │
├─────────────────────────────────────────────────────────┤
│  ▸ DII absorbing sustained FII selling — net support     │  LLM fact
└─────────────────────────────────────────────────────────┘
```

#### Per-stream row content

| Stream | Data rows |
|---|---|
| FII/DII Flows | 7-day table: date / FII net (coloured) / DII net (coloured) + bold cumulative footer |
| Institutional Deal Flow | Top 5 deals: institution / BUY·SELL badge / symbol / ₹value |
| Market News | Top 5 headlines: source tag / title / 1-line content snippet |
| Corporate Filings | Top 6 filings: date / company / filing type badge |

#### Streaming transition

- Raw data rows render immediately on `raw` SSE event (before Ollama responds)
- LLM fact line shows `…` placeholder while streaming
- LLM fact replaces placeholder once scorecard is parsed from accumulated tokens
- No layout shift — StreamFact zone has fixed min-height

#### Narrative + Confidence

Unchanged. 3-sentence verdict and confidence reason remain as a standalone block below all 4 stream sections.

---

### Section 3 — Component Architecture

#### Type changes (`lib/smart-money.ts`)

```typescript
// Enriched with buy/sell
export interface FiiDiiDay {
  date: string;
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
}

// Add content field
export interface NewsHeadline {
  title: string;
  source: string;
  pubDate: string;
  content?: string;
}

// Add topDeals to market stream
export interface MarketStreamData {
  mode: "market";
  fiiDii: FiiDiiDay[];
  newsHeadlines: NewsHeadline[];
  keyFilings: { date: string; company: string; title: string }[];
  dealFlow: {
    totalDeals: number;
    totalBuyCr: number;
    totalSellCr: number;
    netCr: number;
    topDeals: { institution: string; side: string; symbol: string; valueCr: number }[];
  };
}
```

#### New component tree

```
SignalCard
├── StreamSection × 4
│   ├── StreamHeader      signal emoji · label · Bullish/Bearish/Neutral badge
│   ├── StreamDataRows    variant per stream
│   │   ├── FiiDiiRows    7 rows + cumulative footer
│   │   ├── DealRows      top 5 institution deals
│   │   ├── NewsRows      top 5 headlines + snippet
│   │   └── FilingRows    top 6 filing rows
│   └── StreamFact        LLM one-liner (placeholder → text on parse)
├── NarrativeBlock        3-sentence verdict
└── ConfidenceBlock       level badge + reason text
```

#### Files changing

| File | Nature of change |
|---|---|
| `lib/smart-money.ts` | Types, `getRecentFiiDii`, `getRecentNews`, `buildMarketPrompt`, `buildSymbolPrompt` |
| `app/api/smart-money/[symbol]/route.ts` | `buildMarketData` passes buy/sell fields + topDeals |
| `components/dashboard/SmartMoneyWidget.tsx` | Replace scorecard components with StreamSection tree |
| `data/smart-money-cache.json` | Clear after type changes (cache will be stale) |

No new routes. No new dependencies. Cache TTL unchanged (4h).

---

## Out of Scope

- Changing the Ollama model
- Adding new data sources
- Symbol mode layout changes (follow same pattern but not primary focus)
- Pagination or virtualisation of stream rows
