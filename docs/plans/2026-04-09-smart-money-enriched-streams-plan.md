# Smart Money Enriched Streams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the thin scorecard table with 4 always-visible stream sections showing full raw data rows, and enrich the LLM prompt with buy/sell breakdown, news content snippets, and individual deal names.

**Architecture:** Three-layer change — (1) enrich TypeScript types and data readers in `lib/smart-money.ts`, (2) pass new fields through the API route in `app/api/smart-money/[symbol]/route.ts`, (3) replace scorecard UI components with `StreamSection` tree in `SmartMoneyWidget.tsx`. Cache must be cleared after type changes to avoid stale shape mismatches.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Ollama (llama3.1:8b), SSE streaming, file-based JSON data (`data/fii-dii-history.json`, `data/market-news.json`)

---

## Context

- `data/fii-dii-history.json` — each entry already has `fiiEquityBuy`, `fiiEquitySell`, `diiEquityBuy`, `diiEquitySell` fields. They just aren't typed or passed through.
- `data/market-news.json` — 183/200 items have a non-empty `content` field (article snippet). Not currently passed to LLM.
- `lib/nse-deals.ts` `fetchDeals()` returns `Deal[]` with `client` (institution name), `symbol`, `side`, `valueCr` — already available, just not forwarded as `topDeals`.
- Dev server: `npm run dev` in `D:\Sunidhi-Intranet-Futuristic` on port 3001.
- Clear `data/smart-money-cache.json` after any type/prompt change to force fresh generation.

---

## Task 1: Enrich `FiiDiiDay` type and `getRecentFiiDii()`

**Files:**
- Modify: `lib/smart-money.ts`

**Step 1: Update `FiiDiiDay` interface**

In `lib/smart-money.ts`, replace the current `FiiDiiDay` interface (lines 7–11):

```typescript
export interface FiiDiiDay {
  date: string;
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
}
```

**Step 2: No change needed to `getRecentFiiDii()`**

The JSON already has all fields. TypeScript will now include them automatically since the type is widened. `JSON.parse` returns all fields regardless of the type annotation — the old narrow type was just hiding them.

**Step 3: Update `buildMarketPrompt()` FII/DII block**

Replace the `fiiBlock` construction inside `buildMarketPrompt()`:

```typescript
const fiiBlock = fiiDii.length
  ? fiiDii.map(d =>
      `${d.date}: FII bought ₹${d.fiiEquityBuy.toFixed(0)}Cr / sold ₹${d.fiiEquitySell.toFixed(0)}Cr → net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII bought ₹${d.diiEquityBuy.toFixed(0)}Cr / sold ₹${d.diiEquitySell.toFixed(0)}Cr → net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
    ).join("\n") +
    `\n7-day cumulative: FII ${fiiCumulative >= 0 ? "+" : ""}${fiiCumulative.toFixed(0)}Cr | DII ${diiCumulative >= 0 ? "+" : ""}${diiCumulative.toFixed(0)}Cr`
  : "No FII/DII data";
```

**Step 4: Update `buildSymbolPrompt()` FII/DII block with same format**

In `buildSymbolPrompt()`, replace the `fiiBlock` similarly:

```typescript
const fiiBlock = fiiDii.length
  ? fiiDii.map(d =>
      `${d.date}: FII bought ₹${d.fiiEquityBuy.toFixed(0)}Cr / sold ₹${d.fiiEquitySell.toFixed(0)}Cr → net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII bought ₹${d.diiEquityBuy.toFixed(0)}Cr / sold ₹${d.diiEquitySell.toFixed(0)}Cr → net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
    ).join("\n")
  : "No FII/DII data";
```

**Step 5: Verify TypeScript compiles**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

**Step 6: Commit**

```bash
git add lib/smart-money.ts
git commit -m "feat(smart-money): enrich FiiDiiDay with buy/sell breakdown in type and prompts"
```

---

## Task 2: Enrich `NewsHeadline` type and `getRecentNews()`

**Files:**
- Modify: `lib/smart-money.ts`

**Step 1: Add `content` field to `NewsHeadline`**

```typescript
export interface NewsHeadline {
  title: string;
  source: string;
  pubDate: string;
  content?: string;   // article snippet, ~200 chars, may be empty
}
```

**Step 2: Update `getRecentNews()` to map `content`**

Replace the current `getRecentNews()` function:

```typescript
export function getRecentNews(limit = 10): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string; content?: string }[] };
    return data.news
      .slice(0, limit)
      .map(n => ({
        title: n.title,
        source: n.source ?? "Unknown",
        pubDate: n.pubDate,
        content: n.content && n.content.length > 20 ? n.content.slice(0, 220) : undefined,
      }));
  } catch {
    return [];
  }
}
```

**Step 3: Update news block in `buildMarketPrompt()`**

Replace the `newsBlock` construction:

```typescript
const newsBlock = newsHeadlines.length
  ? newsHeadlines.slice(0, 5).map((n, i) => {
      const snippet = n.content ? ` — ${n.content}` : "";
      return `${i + 1}. [${n.source}] ${n.title}${snippet}`;
    }).join("\n") +
    (newsHeadlines.length > 5 ? `\n(+${newsHeadlines.length - 5} more headlines)` : "")
  : "No market news available";
```

Note: pass top 5 with content to LLM (not all 15) — quality over quantity. The LLM gets richer context per item this way.

**Step 4: Verify TypeScript**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add lib/smart-money.ts
git commit -m "feat(smart-money): pass news content snippets to LLM prompt"
```

---

## Task 3: Add `topDeals` to `MarketStreamData` and API route

**Files:**
- Modify: `lib/smart-money.ts`
- Modify: `app/api/smart-money/[symbol]/route.ts`

**Step 1: Add `topDeals` to `dealFlow` in `MarketStreamData`**

In `lib/smart-money.ts`, update the `MarketStreamData` interface:

```typescript
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

**Step 2: Update `buildMarketData()` in the API route**

In `app/api/smart-money/[symbol]/route.ts`, update the `dealFlow` builder inside `buildMarketData()`:

```typescript
const dealFlow = await fetchDeals()
  .then(({ deals }) => {
    let totalBuyCr = 0, totalSellCr = 0, totalDeals = 0;
    for (const d of deals) {
      totalDeals++;
      if (d.side === "BUY") totalBuyCr += d.valueCr;
      else if (d.side === "SELL") totalSellCr += d.valueCr;
    }
    const topDeals = deals.slice(0, 10).map(d => ({
      institution: d.client,
      side: d.side,
      symbol: d.symbol,
      valueCr: d.valueCr,
    }));
    return { totalDeals, totalBuyCr, totalSellCr, netCr: totalBuyCr - totalSellCr, topDeals };
  })
  .catch(() => ({ totalDeals: 0, totalBuyCr: 0, totalSellCr: 0, netCr: 0, topDeals: [] }));
```

**Step 3: Update `dealBlock` in `buildMarketPrompt()`**

In `lib/smart-money.ts`, replace the `dealBlock` construction:

```typescript
const dealBlock = dealFlow.totalDeals > 0
  ? [
      `${dealFlow.totalDeals} deals today | Institutional Buy: ₹${dealFlow.totalBuyCr.toFixed(0)}Cr | Sell: ₹${dealFlow.totalSellCr.toFixed(0)}Cr | Net: ${dealFlow.netCr >= 0 ? "+" : ""}${dealFlow.netCr.toFixed(0)}Cr`,
      ...(dealFlow.topDeals?.length
        ? ["Top deals:", ...dealFlow.topDeals.slice(0, 8).map(d =>
            `  [${d.institution || "Unknown"}] ${d.side} ${d.symbol} ₹${d.valueCr.toFixed(1)}Cr`
          )]
        : [])
    ].join("\n")
  : "No bulk/block deal data for today";
```

**Step 4: Verify TypeScript**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add lib/smart-money.ts app/api/smart-money/[symbol]/route.ts
git commit -m "feat(smart-money): pass individual institution deal rows to LLM prompt"
```

---

## Task 4: Raise Ollama temperature and clear cache

**Files:**
- Modify: `app/api/smart-money/[symbol]/route.ts`
- Modify: `data/smart-money-cache.json`

**Step 1: Raise temperature in `streamOllama()`**

In `app/api/smart-money/[symbol]/route.ts`, change:

```typescript
options: { temperature: 0.3 },
```

to:

```typescript
options: { temperature: 0.45 },
```

**Step 2: Clear the cache**

```bash
echo {} > "D:\Sunidhi-Intranet-Futuristic\data\smart-money-cache.json"
```

Or write `{}` to the file using the Write tool.

**Step 3: Verify TypeScript**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add app/api/smart-money/[symbol]/route.ts data/smart-money-cache.json
git commit -m "feat(smart-money): raise Ollama temperature to 0.45 for more decisive insights; clear cache"
```

---

## Task 5: New stream section UI components

**Files:**
- Modify: `components/dashboard/SmartMoneyWidget.tsx`

This is the largest UI task. Replace `RawMarketScorecard`, `RawSymbolScorecard`, and `ScorecardTable` with a new `StreamSection` component tree.

### Step 1: Add helper to extract per-stream LLM facts from parsed scorecard

Add this helper near the top of the file (after existing helpers):

```typescript
/** Extract { label → fact } map from parsed scorecard rows */
function scorecardFactMap(rows: { label: string; signal: string; fact: string }[]): Record<string, { signal: string; fact: string }> {
  const map: Record<string, { signal: string; fact: string }> = {};
  for (const r of rows) {
    map[r.label.trim().toLowerCase()] = { signal: r.signal, fact: r.fact };
  }
  return map;
}
```

### Step 2: Add `StreamHeader` component

```typescript
function StreamHeader({
  label,
  signal,
  llmSignal,
}: {
  label: string;
  signal: string;          // emoji from raw data
  llmSignal?: string;      // "Bullish" | "Bearish" | "Neutral" from LLM
}) {
  const sigEmoji = signal.match(/^(🟢|🔴|⚪|—)/)?.[0] ?? signal;
  const badgeCls: Record<string, string> = {
    Bullish: "text-teal border-teal/30 bg-teal/10",
    Bearish: "text-danger border-danger/30 bg-danger/10",
    Neutral: "text-muted border-border bg-surface",
  };
  const badge = llmSignal?.match(/Bullish|Bearish|Neutral/i)?.[0];
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{sigEmoji}</span>
        <span className="text-[10px] font-mono font-semibold text-muted uppercase tracking-widest">{label}</span>
      </div>
      {badge && (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeCls[badge] ?? "text-muted border-border"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}
```

### Step 3: Add `StreamFact` component

```typescript
function StreamFact({ fact, streaming }: { fact?: string; streaming: boolean }) {
  if (!fact && !streaming) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-border/30 text-[10px] font-mono text-primary/70 leading-relaxed min-h-[1.2rem]">
      {fact
        ? <span>▸ {fact}</span>
        : <span className="text-muted animate-pulse">▸ …</span>
      }
    </div>
  );
}
```

### Step 4: Add `FiiDiiSection` component

```typescript
function FiiDiiSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData | SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const fiiDii = data.fiiDii;
  const latest = fiiDii.at(-1);
  const rawSignal = latest ? (latest.fiiEquityNet >= 0 ? "🟢" : "🔴") : "—";
  const cumFii = fiiDii.reduce((s, d) => s + d.fiiEquityNet, 0);
  const cumDii = fiiDii.reduce((s, d) => s + d.diiEquityNet, 0);

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="FII / DII Flows" signal={rawSignal} llmSignal={llmRawSignal} />
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-muted">
            <th className="text-left font-normal pb-1 pr-2 w-20">Date</th>
            <th className="text-right font-normal pb-1 pr-2">FII Net</th>
            <th className="text-right font-normal pb-1">DII Net</th>
          </tr>
        </thead>
        <tbody>
          {fiiDii.slice(-7).map(d => (
            <tr key={d.date}>
              <td className="pr-2 py-0.5 text-muted">{d.date.slice(5)}</td>
              <td className={`text-right pr-2 py-0.5 ${d.fiiEquityNet >= 0 ? "text-teal" : "text-danger"}`}>
                {d.fiiEquityNet >= 0 ? "+" : ""}{d.fiiEquityNet.toFixed(0)}Cr
              </td>
              <td className={`text-right py-0.5 ${d.diiEquityNet >= 0 ? "text-teal" : "text-danger"}`}>
                {d.diiEquityNet >= 0 ? "+" : ""}{d.diiEquityNet.toFixed(0)}Cr
              </td>
            </tr>
          ))}
          {fiiDii.length > 1 && (
            <tr className="border-t border-border/40 font-semibold text-primary/80">
              <td className="pr-2 py-0.5">7d total</td>
              <td className={`text-right pr-2 py-0.5 ${cumFii >= 0 ? "text-teal" : "text-danger"}`}>
                {cumFii >= 0 ? "+" : ""}{(cumFii / 100).toFixed(1)}kCr
              </td>
              <td className={`text-right py-0.5 ${cumDii >= 0 ? "text-teal" : "text-danger"}`}>
                {cumDii >= 0 ? "+" : ""}{(cumDii / 100).toFixed(1)}kCr
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 5: Add `DealFlowSection` component

```typescript
function DealFlowSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { dealFlow } = data;
  const rawSignal = dealFlow.totalDeals > 0 ? (dealFlow.netCr >= 0 ? "🟢" : "🔴") : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Institutional Deal Flow" signal={rawSignal} llmSignal={llmRawSignal} />
      {dealFlow.totalDeals === 0 ? (
        <p className="text-muted text-[10px] font-mono">No bulk/block deals today</p>
      ) : (
        <>
          <div className="flex gap-4 text-[10px] font-mono mb-1.5">
            <span className="text-muted">{dealFlow.totalDeals} deals</span>
            <span className="text-teal">Buy ₹{dealFlow.totalBuyCr.toFixed(0)}Cr</span>
            <span className="text-danger">Sell ₹{dealFlow.totalSellCr.toFixed(0)}Cr</span>
            <span className={`font-semibold ${dealFlow.netCr >= 0 ? "text-teal" : "text-danger"}`}>
              Net {dealFlow.netCr >= 0 ? "+" : ""}{dealFlow.netCr.toFixed(0)}Cr
            </span>
          </div>
          {dealFlow.topDeals?.slice(0, 5).map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono py-0.5">
              <span className={`px-1 py-px rounded text-[9px] font-bold ${d.side === "BUY" ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger"}`}>
                {d.side}
              </span>
              <span className="text-primary/70 truncate flex-1">{d.institution || "—"}</span>
              <span className="text-muted shrink-0">{d.symbol}</span>
              <span className="text-primary/80 shrink-0">₹{d.valueCr.toFixed(1)}Cr</span>
            </div>
          ))}
        </>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 6: Add `NewsSection` component

```typescript
function NewsSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const rawSignal = data.newsHeadlines.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Market News Sentiment" signal={rawSignal} llmSignal={llmRawSignal} />
      {data.newsHeadlines.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No headlines</p>
      ) : (
        <div className="space-y-1.5">
          {data.newsHeadlines.slice(0, 5).map((n, i) => (
            <div key={i} className="text-[10px] font-mono">
              <div className="flex items-start gap-1.5">
                <span className="text-amber/70 shrink-0 text-[9px] mt-px">[{n.source}]</span>
                <span className="text-primary/80 leading-snug">{n.title}</span>
              </div>
              {n.content && (
                <p className="text-muted ml-0 mt-0.5 leading-snug text-[9px] line-clamp-2">{n.content}</p>
              )}
            </div>
          ))}
          {data.newsHeadlines.length > 5 && (
            <p className="text-muted text-[9px] font-mono">+{data.newsHeadlines.length - 5} more headlines</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 7: Add `FilingsSection` component

```typescript
function FilingsSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData | SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  // Market mode has keyFilings; symbol mode has announcements
  const filings = data.mode === "market"
    ? (data as MarketStreamData).keyFilings
    : (data as SymbolStreamData).announcements.map(a => ({ date: a.date, company: "", title: a.title }));
  const rawSignal = filings.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-2">
      <StreamHeader label="Corporate Filings" signal={rawSignal} llmSignal={llmRawSignal} />
      {filings.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No recent filings</p>
      ) : (
        <div className="space-y-1">
          {filings.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
              <span className="text-muted shrink-0">{f.date ? f.date.slice(0, 10) : "—"}</span>
              {f.company && <span className="text-amber/80 shrink-0 max-w-[80px] truncate">{f.company}</span>}
              <span className="text-primary/70 leading-snug">{f.title || "Filing"}</span>
            </div>
          ))}
          {filings.length > 6 && (
            <p className="text-muted text-[9px] font-mono">+{filings.length - 6} more filings</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 8: Add `InsiderSection` for symbol mode

```typescript
function InsiderSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { insiders } = data;
  const first = insiders[0];
  const rawSignal = first
    ? (first.transactionType === "Buy" ? "🟢" : first.transactionType === "Sell" ? "🔴" : "⚪")
    : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Insider Activity" signal={rawSignal} llmSignal={llmRawSignal} />
      {insiders.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No disclosures in last 90 days</p>
      ) : (
        <div className="space-y-1">
          {insiders.slice(0, 5).map((ins, i) => (
            <div key={i} className="text-[10px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted shrink-0">{ins.date}</span>
                <span className={`px-1 py-px rounded text-[9px] font-bold shrink-0 ${ins.transactionType === "Buy" ? "bg-teal/10 text-teal" : ins.transactionType === "Sell" ? "bg-danger/10 text-danger" : "bg-border text-muted"}`}>
                  {ins.transactionType}
                </span>
                <span className="text-primary/80 truncate">{ins.name}</span>
              </div>
              <div className="text-muted ml-0 text-[9px]">
                {ins.sharesTransacted.toLocaleString()} shares · {ins.beforePct.toFixed(2)}% → {ins.afterPct.toFixed(2)}% · {ins.category}
              </div>
            </div>
          ))}
          {insiders.length > 5 && (
            <p className="text-muted text-[9px] font-mono">+{insiders.length - 5} more disclosures</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 9: Add `BulkBlockSection` for symbol mode

```typescript
function BulkBlockSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { bulkBlockDeals } = data;
  const rawSignal = bulkBlockDeals.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Bulk / Block Deals" signal={rawSignal} llmSignal={llmRawSignal} />
      {bulkBlockDeals.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No deals today</p>
      ) : (
        <div className="space-y-1">
          {bulkBlockDeals.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
              <span className={`px-1 py-px rounded text-[9px] font-bold ${d.side === "BUY" ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger"}`}>
                {d.side}
              </span>
              <span className="text-primary/70 truncate flex-1">{d.client}</span>
              <span className="text-primary/80 shrink-0">₹{d.valueCr.toFixed(1)}Cr</span>
            </div>
          ))}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}
```

### Step 10: Update `SignalCard` to use new stream sections

Replace the entire block inside `SignalCard` that renders `RawMarketScorecard`, `RawSymbolScorecard`, and `ScorecardTable`. The new render logic:

```typescript
// Inside SignalCard, after the header block:

const scorecardRows = parseScorecard(state.narrative);
const factMap = scorecardFactMap(scorecardRows);

// Helper to extract LLM signal text from parsed scorecard
function getLlmEntry(key: string) {
  // Try fuzzy match: "fii", "deal", "news", "filing", "insider", "bulk"
  const entry = Object.entries(factMap).find(([k]) => k.includes(key));
  if (!entry) return undefined;
  return { signal: entry[1].signal, fact: entry[1].fact };
}
```

Then in the JSX, replace the scorecard/raw-scorecard rendering block with:

```tsx
{/* Stream sections */}
{!state.noData && state.rawData && (
  <div>
    <FiiDiiSection
      data={state.rawData}
      llmFact={getLlmEntry("fii")?.fact}
      llmRawSignal={getLlmEntry("fii")?.signal}
      streaming={state.streaming}
    />
    {state.rawData.mode === "market" && (
      <>
        <DealFlowSection
          data={state.rawData as MarketStreamData}
          llmFact={getLlmEntry("deal")?.fact}
          llmRawSignal={getLlmEntry("deal")?.signal}
          streaming={state.streaming}
        />
        <NewsSection
          data={state.rawData as MarketStreamData}
          llmFact={getLlmEntry("news")?.fact}
          llmRawSignal={getLlmEntry("news")?.signal}
          streaming={state.streaming}
        />
        <FilingsSection
          data={state.rawData}
          llmFact={getLlmEntry("corporate")?.fact ?? getLlmEntry("filing")?.fact}
          llmRawSignal={getLlmEntry("corporate")?.signal ?? getLlmEntry("filing")?.signal}
          streaming={state.streaming}
        />
      </>
    )}
    {state.rawData.mode === "symbol" && (
      <>
        <InsiderSection
          data={state.rawData as SymbolStreamData}
          llmFact={getLlmEntry("insider")?.fact}
          llmRawSignal={getLlmEntry("insider")?.signal}
          streaming={state.streaming}
        />
        <BulkBlockSection
          data={state.rawData as SymbolStreamData}
          llmFact={getLlmEntry("bulk")?.fact}
          llmRawSignal={getLlmEntry("bulk")?.signal}
          streaming={state.streaming}
        />
        <FiiDiiSection
          data={state.rawData}
          llmFact={getLlmEntry("fii")?.fact}
          llmRawSignal={getLlmEntry("fii")?.signal}
          streaming={state.streaming}
        />
        <FilingsSection
          data={state.rawData}
          llmFact={getLlmEntry("bse")?.fact ?? getLlmEntry("announce")?.fact ?? getLlmEntry("filing")?.fact}
          llmRawSignal={getLlmEntry("bse")?.signal ?? getLlmEntry("announce")?.signal}
          streaming={state.streaming}
        />
      </>
    )}
  </div>
)}
```

**Important:** `getLlmEntry` must be defined inside `SignalCard` (it closes over `factMap`). Move the definition into the component body.

Remove the now-unused components: `RawMarketScorecard`, `RawSymbolScorecard`, `ScorecardTable`. Remove unused imports if any. Keep `parseScorecard`, `extractNarrative`, `extractConfidence`, `ConfidenceBadge`, `SkeletonCard`.

### Step 11: Verify TypeScript compiles

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors before proceeding.

### Step 12: Commit

```bash
git add components/dashboard/SmartMoneyWidget.tsx
git commit -m "feat(smart-money): replace scorecard table with expanded stream sections UI"
```

---

## Task 6: Clear cache and verify in browser

**Step 1: Clear cache to force fresh generation**

Write `{}` to `data/smart-money-cache.json`.

**Step 2: Ensure dev server is running**

Dev server should be at `http://localhost:3001`. If not running, start it:

```bash
cd D:\Sunidhi-Intranet-Futuristic && npm run dev
```

**Step 3: Open dashboard and verify**

Navigate to `http://localhost:3001`. Check:
- [ ] MARKET card shows 4 stream sections (FII/DII, Deal Flow, News, Filings)
- [ ] FII/DII section shows 7-day table with coloured net values + cumulative row
- [ ] Deal Flow section shows aggregate stats + institution rows
- [ ] News section shows top 5 headlines with content snippets
- [ ] Filings section shows individual filing rows
- [ ] StreamFact lines show `▸ …` while streaming, then LLM text after
- [ ] Narrative verdict appears below all sections
- [ ] Confidence badge + reason appear at the bottom

**Step 4: Test a real symbol search**

Search `RELIANCE` in the symbol box. Verify:
- [ ] Insider section appears (or "No disclosures" message)
- [ ] Bulk/Block section appears
- [ ] FII/DII section shows market-wide context
- [ ] Filings section shows announcements

**Step 5: Test a fake symbol**

Search `NOTASTOCK`. Verify:
- [ ] "No actionable data found" message appears
- [ ] No Ollama call is made (no streaming animation)

**Step 6: Final commit**

```bash
git add data/smart-money-cache.json
git commit -m "chore: clear smart-money cache after stream enrichment changes"
```

---

## Summary of Files Changed

| File | Task |
|---|---|
| `lib/smart-money.ts` | Tasks 1, 2, 3 |
| `app/api/smart-money/[symbol]/route.ts` | Tasks 3, 4 |
| `components/dashboard/SmartMoneyWidget.tsx` | Task 5 |
| `data/smart-money-cache.json` | Tasks 4, 6 |
