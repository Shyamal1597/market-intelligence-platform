# FII/DII Flow Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/flows` page showing FII and DII institutional equity & debt flows with a 1-year chart, cumulative overlay, 20-day rolling average, Nifty correlation, and summary statistics.

**Architecture:** Server-side API route (`app/api/flows/route.ts`) fetches NSE FII/DII historical data + today's snapshot in parallel, plus Yahoo Finance 1-year Nifty daily closes. Page client-fetches once on load (no auto-poll — FII/DII is end-of-day data). Derived fields (cumulative net, rolling average) computed in `lib/nse-flows.ts` after sorting ascending.

**Tech Stack:** Next.js 16 App Router, TypeScript, Recharts (ComposedChart), Tailwind CSS, NSE public API, Yahoo Finance v8 API (already in use for macro/sectors).

---

## Codebase Patterns to Follow

- API routes: see `app/api/sectors/route.ts` — `force-dynamic`, try/catch, return `{ data, fetchedAt }`
- NSE headers: copy `NSE_HEADERS` constant from `lib/bse-calendar.ts`
- Yahoo Finance fetch: see `fetchQuote()` in `lib/yahoo-finance.ts`
- Client page pattern: see `app/sectors/page.tsx` — per-invocation AbortController, loading/error states
- Component style: see `components/sectors/SectorTile.tsx` for card structure, colours, font classes
- Sidebar: `components/layout/Sidebar.tsx` — add to `NAV` array before the Quick Links entry
- Colours: teal `#00C9A7`, danger `#E84040`, amber `#F5820D`, surface `#13151E`, border `#1E2235`
- Font classes: `font-mono` (JetBrains Mono data), `font-display` (Cormorant headings), `font-sans` (DM Sans body)

---

## Task 1: Data layer — `lib/nse-flows.ts`

**Files:**
- Create: `lib/nse-flows.ts`

### Step 1: Create the file with interfaces and NSE headers

```ts
// lib/nse-flows.ts

const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
};

export interface FiiDiiEntry {
  date: string; // "YYYY-MM-DD"

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

  // Derived — computed after sorting ascending
  cumulativeFiiEquityNet: number;
  cumulativeDiiEquityNet: number;
  rollingAvg20FiiEquity: number;
  rollingAvg20DiiEquity: number;
}

export interface FlowsSnapshot {
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
  fiiDebtBuy: number;
  fiiDebtSell: number;
  fiiDebtNet: number;
  diiDebtBuy: number;
  diiDebtSell: number;
  diiDebtNet: number;
}

export interface NiftyDayClose {
  date: string; // "YYYY-MM-DD"
  close: number;
}
```

### Step 2: Add date helpers

```ts
const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "01-Jan-2025" → "2025-01-01" */
function parseNseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTH_MAP[m[2]];
    if (month) return `${m[3]}-${month}-${m[1]}`;
  }
  // fallback: ISO-like "2025-01-01"
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  return "";
}

/** "2025-01-01" → "01-Jan-2025" for NSE API params */
function toNseParam(iso: string): string {
  const [y, m, d] = iso.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d}-${monthNames[parseInt(m) - 1]}-${y}`;
}
```

### Step 3: Add today's snapshot fetcher

```ts
/** Fetch today's FII/DII snapshot from NSE fiidiiTradeReact endpoint.
 *
 *  NOTE: The actual NSE API response shape must be verified by hitting
 *  https://www.nseindia.com/api/fiidiiTradeReact in a browser (needs NSE cookie).
 *  Adjust field names in parseSnapshotItem() to match what the API actually returns.
 *  Common fields seen: buyValue, sellValue, netValue, category ("FII/FPI", "DII"), type ("Equity","Debt")
 */
interface NseSnapshotItem {
  category?: string;
  buyValue?: string | number;
  sellValue?: string | number;
  netValue?: string | number;
  type?: string;
}

function num(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  return parseFloat(String(v).replace(/,/g, "")) || 0;
}

export async function fetchTodaySnapshot(): Promise<FlowsSnapshot | null> {
  try {
    const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: NSE_HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const items: NseSnapshotItem[] = Array.isArray(json) ? json : [];

    const snap: FlowsSnapshot = {
      fiiEquityBuy: 0, fiiEquitySell: 0, fiiEquityNet: 0,
      diiEquityBuy: 0, diiEquitySell: 0, diiEquityNet: 0,
      fiiDebtBuy: 0,   fiiDebtSell: 0,   fiiDebtNet: 0,
      diiDebtBuy: 0,   diiDebtSell: 0,   diiDebtNet: 0,
    };

    for (const item of items) {
      const isFii = /fii|fpi/i.test(item.category ?? "");
      const isDii = /dii/i.test(item.category ?? "");
      const isEquity = /equity/i.test(item.type ?? "");
      const isDebt = /debt/i.test(item.type ?? "");

      if (isFii && isEquity) {
        snap.fiiEquityBuy = num(item.buyValue);
        snap.fiiEquitySell = num(item.sellValue);
        snap.fiiEquityNet = num(item.netValue);
      } else if (isDii && isEquity) {
        snap.diiEquityBuy = num(item.buyValue);
        snap.diiEquitySell = num(item.sellValue);
        snap.diiEquityNet = num(item.netValue);
      } else if (isFii && isDebt) {
        snap.fiiDebtBuy = num(item.buyValue);
        snap.fiiDebtSell = num(item.sellValue);
        snap.fiiDebtNet = num(item.netValue);
      } else if (isDii && isDebt) {
        snap.diiDebtBuy = num(item.buyValue);
        snap.diiDebtSell = num(item.sellValue);
        snap.diiDebtNet = num(item.netValue);
      }
    }
    return snap;
  } catch {
    return null;
  }
}
```

### Step 4: Add historical data fetcher

```ts
/** Raw shape from NSE historicaldata-fiiDii — verify field names against actual API response.
 *  NSE may use camelCase or snake_case. Adjust parseHistoricalItem() accordingly.
 */
interface NseHistoricalItem {
  date?: string;
  // FII Equity
  fiiBuyEquity?: string | number;
  fiiSellEquity?: string | number;
  fiiNetEquity?: string | number;
  // DII Equity
  diiBuyEquity?: string | number;
  diiSellEquity?: string | number;
  diiNetEquity?: string | number;
  // FII Debt
  fiiBuyDebt?: string | number;
  fiiSellDebt?: string | number;
  fiiNetDebt?: string | number;
  // DII Debt
  diiBuyDebt?: string | number;
  diiSellDebt?: string | number;
  diiNetDebt?: string | number;
  // Allow extra fields
  [key: string]: unknown;
}

export async function fetchHistoricalFlows(
  fromIso: string,
  toIso: string
): Promise<Omit<FiiDiiEntry, "cumulativeFiiEquityNet" | "cumulativeDiiEquityNet" | "rollingAvg20FiiEquity" | "rollingAvg20DiiEquity">[]> {
  const from = toNseParam(fromIso);
  const to = toNseParam(toIso);
  const url = `https://www.nseindia.com/api/historicaldata-fiiDii?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const res = await fetch(url, {
    headers: NSE_HEADERS,
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`NSE historicaldata-fiiDii returned ${res.status}`);

  const json: unknown = await res.json();
  // API may return array directly or nested under a key — handle both
  const raw = Array.isArray(json) ? json : ((json as Record<string, unknown>)?.data ?? []);
  const items: NseHistoricalItem[] = Array.isArray(raw) ? raw : [];

  return items
    .map((item) => {
      const date = parseNseDate(String(item.date ?? ""));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        date,
        fiiEquityBuy:  num(item.fiiBuyEquity),
        fiiEquitySell: num(item.fiiSellEquity),
        fiiEquityNet:  num(item.fiiNetEquity),
        diiEquityBuy:  num(item.diiBuyEquity),
        diiEquitySell: num(item.diiSellEquity),
        diiEquityNet:  num(item.diiNetEquity),
        fiiDebtBuy:    num(item.fiiBuyDebt),
        fiiDebtSell:   num(item.fiiSellDebt),
        fiiDebtNet:    num(item.fiiNetDebt),
        diiDebtBuy:    num(item.diiBuyDebt),
        diiDebtSell:   num(item.diiSellDebt),
        diiDebtNet:    num(item.diiNetDebt),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}
```

**IMPORTANT — API shape uncertainty:** The NSE historical API field names listed above are approximate. After the API route is wired up, hit `/api/flows` in the browser and inspect the raw response. If entries have zeros everywhere, `console.log` the first raw `item` in `fetchHistoricalFlows` to see the actual field names, then update the mapping in `NseHistoricalItem` and the `num()` calls accordingly. The same applies to `fetchTodaySnapshot`.

### Step 5: Add derived field computation + Nifty daily history

```ts
function computeDerived(
  entries: Omit<FiiDiiEntry, "cumulativeFiiEquityNet" | "cumulativeDiiEquityNet" | "rollingAvg20FiiEquity" | "rollingAvg20DiiEquity">[]
): FiiDiiEntry[] {
  let cumFii = 0;
  let cumDii = 0;

  return entries.map((e, i) => {
    cumFii += e.fiiEquityNet;
    cumDii += e.diiEquityNet;

    // 20-day rolling average: average of fiiEquityNet over the past 20 entries (inclusive)
    const windowStart = Math.max(0, i - 19);
    const window = entries.slice(windowStart, i + 1);
    const avgFii = window.reduce((s, x) => s + x.fiiEquityNet, 0) / window.length;
    const avgDii = window.reduce((s, x) => s + x.diiEquityNet, 0) / window.length;

    return {
      ...e,
      cumulativeFiiEquityNet: cumFii,
      cumulativeDiiEquityNet: cumDii,
      rollingAvg20FiiEquity: avgFii,
      rollingAvg20DiiEquity: avgDii,
    };
  });
}

/** Fetch Nifty 50 1-year daily closes from Yahoo Finance.
 *  Uses interval=1d&range=1y — different from the 5m/1d call used in macro.
 */
export async function fetchNiftyDailyHistory(): Promise<NiftyDayClose[]> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1y";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    return timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close: closes[i] ?? 0,
      }))
      .filter((d) => d.close > 0);
  } catch {
    return [];
  }
}

/** Main export: fetches everything and returns combined payload. */
export async function fetchAllFlowData(): Promise<{
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: NiftyDayClose[];
}> {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);

  const fromIso = fromDate.toISOString().slice(0, 10);
  const toIso = toDate.toISOString().slice(0, 10);

  const [rawEntries, snapshot, nifty] = await Promise.allSettled([
    fetchHistoricalFlows(fromIso, toIso),
    fetchTodaySnapshot(),
    fetchNiftyDailyHistory(),
  ]);

  const historical =
    rawEntries.status === "fulfilled" ? rawEntries.value : [];

  // Sort ascending by date before computing derived fields
  historical.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const entries = computeDerived(historical);

  return {
    entries,
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    nifty: nifty.status === "fulfilled" ? nifty.value : [],
  };
}
```

### Step 6: Commit

```bash
git add lib/nse-flows.ts
git commit -m "feat: add nse-flows data layer (FII/DII historical + snapshot + Nifty overlay)"
```

---

## Task 2: API route — `app/api/flows/route.ts`

**Files:**
- Create: `app/api/flows/route.ts`

### Step 1: Create the route

```ts
// app/api/flows/route.ts
import { NextResponse } from "next/server";
import { fetchAllFlowData } from "@/lib/nse-flows";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllFlowData();
    return NextResponse.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Flows API error:", error);
    return NextResponse.json(
      { entries: [], snapshot: null, nifty: [], fetchedAt: new Date().toISOString(), error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Step 2: Verify the API response

Start the dev server (`npm run dev`) and open `http://localhost:3000/api/flows` in the browser.

Check:
- `entries` array is non-empty with valid dates
- `snapshot` object has non-zero values (or `null` if NSE blocks server-side)
- `nifty` array has ~252 entries with `date` and `close`

If `entries` is empty or all zeros: add a temporary `console.log(JSON.stringify(items[0], null, 2))` inside `fetchHistoricalFlows` to see the actual API field names. Update `NseHistoricalItem` and field mapping accordingly.

If NSE returns a non-array under a nested key (e.g., `{ data: [...] }`): the current code handles this via `(json as Record<string, unknown>)?.data`. If it's under a different key, update that line.

### Step 3: Commit

```bash
git add app/api/flows/route.ts
git commit -m "feat: add /api/flows route"
```

---

## Task 3: Snapshot cards — `components/flows/FlowSnapshotCard.tsx`

**Files:**
- Create: `components/flows/FlowSnapshotCard.tsx`

### Step 1: Create the component

```tsx
// components/flows/FlowSnapshotCard.tsx

interface FlowSnapshotCardProps {
  label: string;      // e.g. "FII EQUITY"
  buy: number;
  sell: number;
  net: number;
}

function crore(v: number): string {
  const abs = Math.abs(v);
  return `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

export function FlowSnapshotCard({ label, buy, sell, net }: FlowSnapshotCardProps) {
  const positive = net >= 0;
  const bgClass = positive ? "bg-teal/10 border-teal/20" : "bg-danger/10 border-danger/20";
  const netColor = positive ? "text-teal" : "text-danger";
  const sign = positive ? "+" : "-";

  return (
    <div className={`border rounded-xl p-4 flex flex-col gap-2 ${bgClass}`}>
      <p className="font-mono text-[10px] tracking-widest text-muted uppercase">
        {label}
      </p>
      <p className={`font-mono text-2xl font-bold leading-none ${netColor}`}>
        {sign}{crore(net)}
      </p>
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="font-mono text-xs text-muted">
          <span className="text-teal/70">B</span>&nbsp;{crore(buy)}
        </p>
        <p className="font-mono text-xs text-muted">
          <span className="text-danger/70">S</span>&nbsp;{crore(sell)}
        </p>
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add components/flows/FlowSnapshotCard.tsx
git commit -m "feat: add FlowSnapshotCard component"
```

---

## Task 4: Chart — `components/flows/FlowChart.tsx`

**Files:**
- Create: `components/flows/FlowChart.tsx`

This is the most complex component. It renders a Recharts `ComposedChart` with:
- **Bars** — daily net (teal positive, danger negative). Recharts doesn't support per-bar colour natively with Bar component alone — use a custom Cell approach.
- **Line** — cumulative net (amber, right Y-axis)
- **Line** — 20-day rolling average (white/60%, left Y-axis)
- **Line** — Nifty normalised (purple/40%, right Y-axis, single-entity views only)

Two toggle groups control which data is displayed:
- **Segment:** Equity | Debt
- **Entity:** FII | DII | FII vs DII

In "FII vs DII" mode: overlay two sets of bars (FII + DII) — use two `Bar` elements with different `dataKey` and opacity. Hide the Nifty overlay in this mode to reduce clutter.

### Step 1: Create the component

```tsx
"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend, ReferenceLine,
} from "recharts";
import type { FiiDiiEntry, NiftyDayClose } from "@/lib/nse-flows";

type Segment = "equity" | "debt";
type Entity = "fii" | "dii" | "both";

interface FlowChartProps {
  entries: FiiDiiEntry[];
  nifty: NiftyDayClose[];
}

function toggleBtn(label: string, active: boolean, onClick: () => void) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
        active
          ? "bg-amber/20 text-amber border border-amber/30"
          : "text-muted border border-[#1E2235] hover:text-primary hover:border-[#2E3250]"
      }`}
    >
      {label}
    </button>
  );
}

export function FlowChart({ entries, nifty }: FlowChartProps) {
  const [segment, setSegment] = useState<Segment>("equity");
  const [entity, setEntity] = useState<Entity>("fii");

  // Build a map from date → Nifty close for quick lookup
  const niftyMap = useMemo(() => {
    const m = new Map<string, number>();
    nifty.forEach((n) => m.set(n.date, n.close));
    return m;
  }, [nifty]);

  // Normalise Nifty to roughly the same scale as daily net bars
  // Scale factor: (max absolute daily net) / (max Nifty close)
  const niftyNormalised = useMemo(() => {
    if (!nifty.length || !entries.length) return new Map<string, number>();
    const maxNet = Math.max(...entries.map((e) => Math.abs(e.fiiEquityNet)), 1);
    const maxNifty = Math.max(...nifty.map((n) => n.close), 1);
    const scale = maxNet / maxNifty;
    const m = new Map<string, number>();
    nifty.forEach((n) => m.set(n.date, n.close * scale));
    return m;
  }, [entries, nifty]);

  const chartData = useMemo(() => {
    return entries.map((e) => {
      const fiiNet =
        segment === "equity" ? e.fiiEquityNet : e.fiiDebtNet;
      const diiNet =
        segment === "equity" ? e.diiEquityNet : e.diiDebtNet;
      const cumulFii =
        segment === "equity" ? e.cumulativeFiiEquityNet : null; // debt cumulative not derived yet — show null
      const rollingFii =
        segment === "equity" ? e.rollingAvg20FiiEquity : null;
      const cumulDii =
        segment === "equity" ? e.cumulativeDiiEquityNet : null;
      const rollingDii =
        segment === "equity" ? e.rollingAvg20DiiEquity : null;
      const niftyVal = entity !== "both" ? (niftyNormalised.get(e.date) ?? null) : null;

      return {
        date: e.date,
        // month label for X axis tick
        label: new Date(e.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        fiiNet,
        diiNet,
        cumulFii: entity === "fii" || entity === "both" ? cumulFii : null,
        cumulDii: entity === "dii" || entity === "both" ? cumulDii : null,
        rollingFii: entity === "fii" || entity === "both" ? rollingFii : null,
        rollingDii: entity === "dii" || entity === "both" ? rollingDii : null,
        nifty: niftyVal,
      };
    });
  }, [entries, segment, entity, niftyNormalised]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#13151E] border border-[#1E2235] rounded-lg p-3 text-xs font-mono shadow-xl">
        <p className="text-muted mb-2">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }} className="leading-5">
            {p.name}: {p.value !== null ? `₹${Math.round(p.value).toLocaleString("en-IN")} Cr` : "—"}
          </p>
        ))}
      </div>
    );
  };

  // X-axis: show 1 tick per month (filter entries to first of each month)
  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    return chartData
      .filter((d) => {
        const month = d.date.slice(0, 7);
        if (seen.has(month)) return false;
        seen.add(month);
        return true;
      })
      .map((d) => d.date);
  }, [chartData]);

  return (
    <div>
      {/* Toggle controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-1.5">
          {toggleBtn("EQUITY", segment === "equity", () => setSegment("equity"))}
          {toggleBtn("DEBT", segment === "debt", () => setSegment("debt"))}
        </div>
        <div className="w-px h-4 bg-[#1E2235]" />
        <div className="flex gap-1.5">
          {toggleBtn("FII", entity === "fii", () => setEntity("fii"))}
          {toggleBtn("DII", entity === "dii", () => setEntity("dii"))}
          {toggleBtn("FII vs DII", entity === "both", () => setEntity("both"))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("en-IN", { month: "short" })
            }
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
          />
          {/* Left Y-axis: daily net + rolling avg */}
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
          />
          {/* Right Y-axis: cumulative */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="left" y={0} stroke="#1E2235" strokeWidth={1} />

          {/* Daily net bars — FII */}
          {(entity === "fii" || entity === "both") && (
            <Bar yAxisId="left" dataKey="fiiNet" name="FII Daily Net" isAnimationActive={false} maxBarSize={entity === "both" ? 6 : 10}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={(d.fiiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"} opacity={entity === "both" ? 0.7 : 1} />
              ))}
            </Bar>
          )}
          {/* Daily net bars — DII */}
          {(entity === "dii" || entity === "both") && (
            <Bar yAxisId="left" dataKey="diiNet" name="DII Daily Net" isAnimationActive={false} maxBarSize={entity === "both" ? 6 : 10}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={(d.diiNet ?? 0) >= 0 ? "#00C9A7" : "#E84040"} opacity={entity === "both" ? 0.5 : 1} />
              ))}
            </Bar>
          )}

          {/* Cumulative net lines */}
          {entity !== "both" && (
            <Line
              yAxisId="right"
              dataKey={entity === "fii" ? "cumulFii" : "cumulDii"}
              name="Cumulative Net"
              stroke="#F5820D"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* 20-day rolling average */}
          {entity !== "both" && (
            <Line
              yAxisId="left"
              dataKey={entity === "fii" ? "rollingFii" : "rollingDii"}
              name="20D Avg"
              stroke="rgba(240,237,232,0.5)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
              strokeDasharray="4 2"
            />
          )}

          {/* Nifty normalised overlay (single entity only) */}
          {entity !== "both" && (
            <Line
              yAxisId="left"
              dataKey="nifty"
              name="Nifty (scaled)"
              stroke="rgba(139,92,246,0.45)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Add the missing React imports at the top:
```ts
import { useState, useMemo } from "react";
```

### Step 2: Verify visually

After wiring into the page (Task 6), check:
- Toggle buttons switch data correctly
- Bars are teal for positive days, red for negative
- Amber cumulative line tracks running sum
- Dashed white rolling average smooths the bar noise
- Purple Nifty overlay is present but subtle
- FII vs DII mode shows two overlapping bar sets

### Step 3: Commit

```bash
git add components/flows/FlowChart.tsx
git commit -m "feat: add FlowChart ComposedChart with segment/entity toggles"
```

---

## Task 5: Summary strip — `components/flows/FlowSummaryStrip.tsx`

**Files:**
- Create: `components/flows/FlowSummaryStrip.tsx`

### Step 1: Create the component

```tsx
// components/flows/FlowSummaryStrip.tsx
import type { FiiDiiEntry } from "@/lib/nse-flows";

interface FlowSummaryStripProps {
  entries: FiiDiiEntry[];
}

function croreStr(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

function colorClass(v: number) {
  return v >= 0 ? "text-teal" : "text-danger";
}

export function FlowSummaryStrip({ entries }: FlowSummaryStripProps) {
  if (!entries.length) return null;

  const today = new Date();
  const startOfMonth = today.toISOString().slice(0, 7); // "YYYY-MM"
  const startOfQuarter = (() => {
    const m = today.getMonth(); // 0-indexed
    const qStartMonth = Math.floor(m / 3) * 3;
    const d = new Date(today.getFullYear(), qStartMonth, 1);
    return d.toISOString().slice(0, 7);
  })();
  const startOfYear = `${today.getFullYear()}-01`;

  // Sum fiiEquityNet for each period
  const mtd = entries.filter((e) => e.date.slice(0, 7) >= startOfMonth).reduce((s, e) => s + e.fiiEquityNet, 0);
  const qtd = entries.filter((e) => e.date.slice(0, 7) >= startOfQuarter).reduce((s, e) => s + e.fiiEquityNet, 0);
  const ytd = entries.filter((e) => e.date.slice(0, 7) >= startOfYear).reduce((s, e) => s + e.fiiEquityNet, 0);

  const buyerDays = entries.filter((e) => e.fiiEquityNet > 0).length;
  const sellerDays = entries.filter((e) => e.fiiEquityNet < 0).length;

  // Current streak: count consecutive days from end where sign is consistent
  const streakSign = entries[entries.length - 1]?.fiiEquityNet >= 0 ? "buyer" : "seller";
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const isPositive = entries[i].fiiEquityNet >= 0;
    if ((streakSign === "buyer" && isPositive) || (streakSign === "seller" && !isPositive)) {
      streak++;
    } else {
      break;
    }
  }

  // Top 5 inflows and outflows (FII equity)
  const sorted = [...entries].sort((a, b) => b.fiiEquityNet - a.fiiEquityNet);
  const topInflows = sorted.slice(0, 5);
  const topOutflows = sorted.slice(-5).reverse();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="border border-[#1E2235] rounded-xl bg-surface p-5 space-y-5">
      {/* MTD / QTD / YTD + streak */}
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <span className="font-mono text-xs text-muted">
          MTD&nbsp;<span className={`${colorClass(mtd)} font-semibold`}>{croreStr(mtd)}</span>
        </span>
        <span className="font-mono text-xs text-muted">
          QTD&nbsp;<span className={`${colorClass(qtd)} font-semibold`}>{croreStr(qtd)}</span>
        </span>
        <span className="font-mono text-xs text-muted">
          YTD&nbsp;<span className={`${colorClass(ytd)} font-semibold`}>{croreStr(ytd)}</span>
        </span>
        <span className="text-muted font-mono text-xs">·</span>
        <span className="font-mono text-xs text-muted">
          Net buyer&nbsp;<span className="text-primary">{buyerDays}d</span>
        </span>
        <span className="font-mono text-xs text-muted">
          Net seller&nbsp;<span className="text-primary">{sellerDays}d</span>
        </span>
        <span className="text-muted font-mono text-xs">·</span>
        <span className="font-mono text-xs text-muted">
          Streak&nbsp;
          <span className={streakSign === "buyer" ? "text-teal" : "text-danger"}>
            {streak}d net {streakSign}
          </span>
        </span>
      </div>

      {/* Top flow days */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-2">
            Biggest Inflows (FII Equity)
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {topInflows.map((e) => (
              <span key={e.date} className="font-mono text-xs">
                <span className="text-muted">{formatDate(e.date)}</span>
                &nbsp;
                <span className="text-teal">+₹{Math.round(e.fiiEquityNet).toLocaleString("en-IN")} Cr</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-2">
            Biggest Outflows (FII Equity)
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {topOutflows.map((e) => (
              <span key={e.date} className="font-mono text-xs">
                <span className="text-muted">{formatDate(e.date)}</span>
                &nbsp;
                <span className="text-danger">-₹{Math.round(Math.abs(e.fiiEquityNet)).toLocaleString("en-IN")} Cr</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add components/flows/FlowSummaryStrip.tsx
git commit -m "feat: add FlowSummaryStrip (MTD/QTD/YTD, streak, top flow days)"
```

---

## Task 6: Page — `app/flows/page.tsx`

**Files:**
- Create: `app/flows/page.tsx`

### Step 1: Create the page

```tsx
// app/flows/page.tsx
"use client";

import { useEffect, useState } from "react";
import { FlowSnapshotCard } from "@/components/flows/FlowSnapshotCard";
import { FlowChart } from "@/components/flows/FlowChart";
import { FlowSummaryStrip } from "@/components/flows/FlowSummaryStrip";
import type { FiiDiiEntry, FlowsSnapshot, NiftyDayClose } from "@/lib/nse-flows";

interface FlowsData {
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: NiftyDayClose[];
  fetchedAt: string;
}

export default function FlowsPage() {
  const [data, setData] = useState<FlowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/flows", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((d: FlowsData) => {
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError("Could not load flow data.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const snap = data?.snapshot;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            FII / DII Flows
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-teal border border-teal/30 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-muted text-sm font-sans">
          Institutional equity &amp; debt flows · NSE data · 1-year view
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          {/* Snapshot skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-32 bg-surface rounded-xl border border-[#1E2235]" />
            ))}
          </div>
          {/* Chart skeleton */}
          <div className="animate-pulse h-[400px] bg-surface rounded-xl border border-[#1E2235]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Row 1: Snapshot cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FlowSnapshotCard
              label="FII Equity"
              buy={snap?.fiiEquityBuy ?? 0}
              sell={snap?.fiiEquitySell ?? 0}
              net={snap?.fiiEquityNet ?? 0}
            />
            <FlowSnapshotCard
              label="DII Equity"
              buy={snap?.diiEquityBuy ?? 0}
              sell={snap?.diiEquitySell ?? 0}
              net={snap?.diiEquityNet ?? 0}
            />
            <FlowSnapshotCard
              label="FII Debt"
              buy={snap?.fiiDebtBuy ?? 0}
              sell={snap?.fiiDebtSell ?? 0}
              net={snap?.fiiDebtNet ?? 0}
            />
            <FlowSnapshotCard
              label="DII Debt"
              buy={snap?.diiDebtBuy ?? 0}
              sell={snap?.diiDebtSell ?? 0}
              net={snap?.diiDebtNet ?? 0}
            />
          </div>

          {/* Row 2: Chart */}
          {data && data.entries.length > 0 ? (
            <div className="border border-[#1E2235] rounded-xl bg-surface p-5">
              <FlowChart entries={data.entries} nifty={data.nifty} />
            </div>
          ) : (
            <div className="border border-[#1E2235] rounded-xl bg-surface p-8 text-center text-muted font-mono text-sm">
              No historical data available
            </div>
          )}

          {/* Row 3: Summary strip */}
          {data && data.entries.length > 0 && (
            <FlowSummaryStrip entries={data.entries} />
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 2: Commit

```bash
git add app/flows/page.tsx
git commit -m "feat: add /flows page with snapshot, chart, and summary"
```

---

## Task 7: Sidebar navigation entry

**Files:**
- Modify: `components/layout/Sidebar.tsx`

### Step 1: Add `Activity` icon import and NAV entry

In `Sidebar.tsx`, the current imports include `TrendingUp` which is already used for Macro. For Flows, use `Activity` from lucide-react (represents market activity / flow data).

Add `Activity` to the import line:
```ts
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  BookMarked,
  CalendarDays,
  LayoutGrid,
  Activity,      // ← add this
  ChevronRight,
} from "lucide-react";
```

Add to the `NAV` array, between Sectors and Quick Links:
```ts
{ href: "/flows", icon: Activity, label: "Flows" },
```

So the NAV array becomes:
```ts
const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/news", icon: Newspaper, label: "Market News" },
  { href: "/macro", icon: TrendingUp, label: "Macro" },
  { href: "/filings", icon: FileText, label: "NSE Filings" },
  { href: "/calendar", icon: CalendarDays, label: "Earnings" },
  { href: "/sectors", icon: LayoutGrid, label: "Sectors" },
  { href: "/flows", icon: Activity, label: "Flows" },   // ← add this line
  { href: "/links", icon: BookMarked, label: "Quick Links" },
];
```

### Step 2: Commit

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add Flows nav entry to sidebar"
```

---

## Task 8: Build verification

### Step 1: Run build

```bash
npm run build
```

Expected: clean build, 0 errors, 15 routes (14 existing + `/flows`).

If TypeScript errors: fix type mismatches in the component props (most likely `FiiDiiEntry` field access).

If Recharts import errors: ensure all used components (`ComposedChart`, `Cell`, `ReferenceLine`, `Legend`) are imported from `recharts`.

### Step 2: Verify in preview

Start the server and open `http://localhost:3001/flows`.

Check:
1. Header + LIVE badge renders
2. 4 snapshot cards show (may show ₹0 if NSE blocks server-side today's data — this is expected)
3. Chart renders with bars and lines
4. Toggle buttons switch between Equity/Debt and FII/DII/FII vs DII
5. Summary strip shows MTD/QTD/YTD values and top flow days
6. No console errors

### Step 3: Final commit if any fixes needed

```bash
git add -A
git commit -m "fix: flows page build and runtime corrections"
```
