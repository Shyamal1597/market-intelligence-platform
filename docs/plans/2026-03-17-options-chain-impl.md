# Options Chain Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Sensibull-style options chain page at `/derivatives` with live NSE data, configurable columns, OI/Volume toggle, and IV skew chart.

**Architecture:** NSE two-step fetch (contract-info → option-chain-v3) proxied through Next.js API routes. Client polls every 30s, pauses when tab hidden. All state lives in `OptionChainPage.tsx`; column visibility persisted to localStorage.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Recharts, Lucide React, clsx

**Working directory:** `D:\Sunidhi-Intranet-Futuristic\`

---

## Task 1: Port & extend `lib/nse-derivatives.ts`

**Files:**
- Create: `lib/nse-derivatives.ts`

Copy the existing lib from `D:\Sunidhi Intranet\.claude\worktrees\awesome-chaplygin\lib\nse-derivatives.ts` with these changes:

**Step 1: Create the file with full Greek fields and any-symbol support**

Change the `OptionRow` type to include all Greeks + ask/bid. Change `fetchDerivatives` signature to accept any `string` symbol (not just the union type). Add `ceAsk`, `ceBid`, `ceDelta`, `ceGamma`, `ceTheta`, `ceVega`, `ceRho`, `peAsk`, `peBid`, `peDelta`, `peGamma`, `peTheta`, `peVega`, `peRho` to the row mapping.

```ts
// lib/nse-derivatives.ts
const NSE_BASE = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const JSON_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/option-chain",
  "X-Requested-With": "XMLHttpRequest",
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export interface OptionRow {
  strikePrice: number;
  expiryDate: string;
  // Calls
  ceOI: number | null; ceOIChg: number | null; ceVol: number | null;
  ceIV: number | null; ceLTP: number | null; ceAsk: number | null; ceBid: number | null;
  ceDelta: number | null; ceGamma: number | null; ceTheta: number | null;
  ceVega: number | null; ceRho: number | null;
  // Puts
  peOI: number | null; peOIChg: number | null; peVol: number | null;
  peIV: number | null; peLTP: number | null; peAsk: number | null; peBid: number | null;
  peDelta: number | null; peGamma: number | null; peTheta: number | null;
  peVega: number | null; peRho: number | null;
}

export interface DerivativesData {
  symbol: string; expiry: string; expiryDates: string[];
  spot: number; timestamp: string; pcr: number; maxPain: number;
  atmStrike: number; atmIV: number; chain: OptionRow[];
  fetchedAt: string;
}

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const arr: string[] = h.getSetCookie
    ? h.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
  return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function getNseSession(): Promise<string> {
  const warmupRes = await fetch(`${NSE_BASE}/option-chain`, {
    headers: { ...HTML_HEADERS, "Sec-Fetch-Site": "none" },
  });
  return extractCookies(warmupRes);
}

function computeMaxPain(chain: OptionRow[]): number {
  const strikes = chain.map((r) => r.strikePrice);
  let minLoss = Infinity;
  let maxPainStrike = strikes[Math.floor(strikes.length / 2)] ?? 0;
  for (const testStrike of strikes) {
    let totalLoss = 0;
    for (const row of chain) {
      if (row.ceOI != null && testStrike > row.strikePrice)
        totalLoss += (testStrike - row.strikePrice) * row.ceOI;
      if (row.peOI != null && testStrike < row.strikePrice)
        totalLoss += (row.strikePrice - testStrike) * row.peOI;
    }
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = testStrike; }
  }
  return maxPainStrike;
}

function findAtmStrike(chain: OptionRow[], spot: number): number {
  return chain.reduce((best, row) =>
    Math.abs(row.strikePrice - spot) < Math.abs(best.strikePrice - spot) ? row : best
  ).strikePrice;
}

const cache = new Map<string, { data: DerivativesData; ts: number }>();
const CACHE_TTL = 30 * 1000; // 30s — matches client polling interval

const INDICES = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"]);

export async function fetchDerivatives(symbol: string, expiry?: string): Promise<DerivativesData> {
  const sym = symbol.toUpperCase();
  const cacheKey = `${sym}:${expiry ?? "nearest"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const cookie = await getNseSession();

  // Step 1: get expiry dates
  const infoRes = await fetch(
    `${NSE_BASE}/api/option-chain-contract-info?symbol=${sym}`,
    { headers: { ...JSON_HEADERS, Cookie: cookie } }
  );
  if (!infoRes.ok) throw new Error(`NSE contract-info ${infoRes.status}`);
  const info = await infoRes.json();
  const expiryDates: string[] = info.expiryDates ?? [];
  if (expiryDates.length === 0) throw new Error("NSE_SESSION_REQUIRED");
  const selectedExpiry = expiry ?? expiryDates[0];

  // Step 2: fetch chain
  const chainType = INDICES.has(sym) ? "Indices" : "Equity";
  const url = `${NSE_BASE}/api/option-chain-v3?type=${chainType}&symbol=${sym}&expiry=${encodeURIComponent(selectedExpiry)}`;
  const res = await fetch(url, { headers: { ...JSON_HEADERS, Cookie: cookie } });
  if (!res.ok) throw new Error(`NSE option-chain-v3 ${res.status}`);
  const json = await res.json();
  if (!json.records) throw new Error("NSE_SESSION_REQUIRED");

  const spot: number = json.records?.underlyingValue ?? 0;
  const timestamp: string = json.records?.timestamp ?? "";
  const rawData: Record<string, unknown>[] = json.records?.data ?? [];

  const chain: OptionRow[] = rawData
    .map((d) => {
      const ce = d.CE as Record<string, number> | undefined;
      const pe = d.PE as Record<string, number> | undefined;
      return {
        strikePrice: d.strikePrice as number,
        expiryDate: selectedExpiry,
        ceOI: ce?.openInterest ?? null, ceOIChg: ce?.changeinOpenInterest ?? null,
        ceVol: ce?.totalTradedVolume ?? null, ceIV: ce?.impliedVolatility ?? null,
        ceLTP: ce?.lastPrice ?? null, ceAsk: ce?.askPrice ?? null, ceBid: ce?.bidPrice ?? null,
        ceDelta: ce?.delta ?? null, ceGamma: ce?.gamma ?? null, ceTheta: ce?.theta ?? null,
        ceVega: ce?.vega ?? null, ceRho: ce?.rho ?? null,
        peOI: pe?.openInterest ?? null, peOIChg: pe?.changeinOpenInterest ?? null,
        peVol: pe?.totalTradedVolume ?? null, peIV: pe?.impliedVolatility ?? null,
        peLTP: pe?.lastPrice ?? null, peAsk: pe?.askPrice ?? null, peBid: pe?.bidPrice ?? null,
        peDelta: pe?.delta ?? null, peGamma: pe?.gamma ?? null, peTheta: pe?.theta ?? null,
        peVega: pe?.vega ?? null, peRho: pe?.rho ?? null,
      };
    })
    .sort((a, b) => a.strikePrice - b.strikePrice);

  const filtered = json.filtered ?? {};
  const totCeOI: number = filtered.CE?.totOI ?? 1;
  const totPeOI: number = filtered.PE?.totOI ?? 0;
  const pcr = totPeOI / totCeOI;
  const maxPain = computeMaxPain(chain);
  const atmStrike = chain.length > 0 ? findAtmStrike(chain, spot) : 0;
  const atmRow = chain.find((r) => r.strikePrice === atmStrike);
  const atmIV = atmRow?.ceIV ?? atmRow?.peIV ?? 0;

  const data: DerivativesData = {
    symbol: sym, expiry: selectedExpiry, expiryDates, spot, timestamp,
    pcr, maxPain, atmStrike, atmIV, chain, fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// Lightweight expiry-only fetch — for symbol validation in the UI
export async function fetchExpiries(symbol: string): Promise<string[]> {
  const sym = symbol.toUpperCase();
  try {
    const cookie = await getNseSession();
    const res = await fetch(
      `${NSE_BASE}/api/option-chain-contract-info?symbol=${sym}`,
      { headers: { ...JSON_HEADERS, Cookie: cookie } }
    );
    if (!res.ok) return [];
    const info = await res.json();
    return info.expiryDates ?? [];
  } catch {
    return [];
  }
}
```

**Step 2: Verify file saved correctly**
```bash
node -e "const d = require('./lib/nse-derivatives.ts'); console.log('ok')"
```
(Will fail on TS import, but confirms file exists — actual test is TypeScript compile in Task 3.)

**Step 3: Commit**
```bash
cd "D:\Sunidhi-Intranet-Futuristic"
git add lib/nse-derivatives.ts
git commit -m "feat: add nse-derivatives lib with full Greeks and any-symbol support"
```

---

## Task 2: Create API routes

**Files:**
- Create: `app/api/option-chain/expiries/route.ts`
- Create: `app/api/option-chain/route.ts`

**Step 1: Create expiries route**

```ts
// app/api/option-chain/expiries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchExpiries } from "@/lib/nse-derivatives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "NIFTY";
  try {
    const expiries = await fetchExpiries(symbol);
    return NextResponse.json({ symbol, expiries });
  } catch (err) {
    return NextResponse.json({ symbol, expiries: [], error: String(err) }, { status: 500 });
  }
}
```

**Step 2: Create chain route**

```ts
// app/api/option-chain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchDerivatives } from "@/lib/nse-derivatives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "NIFTY";
  const expiry = req.nextUrl.searchParams.get("expiry") ?? undefined;
  try {
    const data = await fetchDerivatives(symbol, expiry);
    return NextResponse.json(data);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("NSE_SESSION_REQUIRED")) {
      return NextResponse.json({ error: "NSE_SESSION_REQUIRED" }, { status: 503 });
    }
    console.error("[option-chain]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 3: Test routes manually via browser (after server starts in Task 13)**

- `http://192.168.48.102:3001/api/option-chain/expiries?symbol=NIFTY` → should return array of dates
- `http://192.168.48.102:3001/api/option-chain?symbol=NIFTY` → should return full chain JSON

**Step 4: Commit**
```bash
git add app/api/option-chain/
git commit -m "feat: option-chain API routes (expiries + full chain)"
```

---

## Task 3: Update nav — OmniCore + Sidebar

**Files:**
- Modify: `components/layout/OmniCore.tsx`
- Modify: `components/layout/Sidebar.tsx`

**Step 1: Update OmniCore**

The futuristic OmniCore has extra clutter (Search button, Analyst, etc.). Replace the entire NAV_ITEMS and clean up:

```tsx
// In components/layout/OmniCore.tsx — replace NAV_ITEMS and imports
import {
  LayoutDashboard, Newspaper, TrendingUp, FileText,
  CalendarDays, LayoutGrid, Activity, BarChart2,
  BookMarked, Sigma, Settings
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/news", label: "Market News", icon: Newspaper },
  { href: "/macro", label: "Macro Data", icon: TrendingUp },
  { href: "/filings", label: "NSE Filings", icon: FileText },
  { href: "/calendar", label: "Earnings", icon: CalendarDays },
  { href: "/sectors", label: "Sectors", icon: LayoutGrid },
  { href: "/flows", label: "Flows", icon: Activity },
  { href: "/results", label: "Results", icon: BarChart2 },
  { href: "/derivatives", label: "Derivatives", icon: Sigma },
  { href: "/links", label: "Quick Links", icon: BookMarked },
];
```

Also remove the Search button block (`<button className="flex items-center gap-2 px-3...">`) and the divider before it from the JSX.

**Step 2: Update Sidebar**

Add Derivatives with Sigma icon:
```tsx
// Add to imports: Sigma, Layers (for deals if needed)
import { ..., Sigma } from "lucide-react";

// Add to NAV array (after flows):
{ href: "/derivatives", icon: Sigma, label: "Derivatives" },
```

**Step 3: Commit**
```bash
git add components/layout/OmniCore.tsx components/layout/Sidebar.tsx
git commit -m "feat: add Derivatives to nav, clean OmniCore"
```

---

## Task 4: Page shell + `OptionChainPage` skeleton

**Files:**
- Create: `app/derivatives/page.tsx`
- Create: `components/derivatives/OptionChainPage.tsx`

**Step 1: Create page shell**

```tsx
// app/derivatives/page.tsx
import { OptionChainPage } from "@/components/derivatives/OptionChainPage";

export const metadata = { title: "Derivatives | Project NEBULA" };

export default function DerivativesPage() {
  return <OptionChainPage />;
}
```

**Step 2: Create OptionChainPage skeleton with state**

```tsx
// components/derivatives/OptionChainPage.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DerivativesData } from "@/lib/nse-derivatives";

export type ActiveTab = "chain" | "volatility";
export type BarMode = "oi" | "volume";

const DEFAULT_SYMBOL = "NIFTY";

export function OptionChainPage() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [data, setData] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>("chain");
  const [barMode, setBarMode] = useState<BarMode>("oi");
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch expiries when symbol changes
  const fetchExpiries = useCallback(async (sym: string) => {
    const res = await fetch(`/api/option-chain/expiries?symbol=${sym}`);
    const json = await res.json();
    return (json.expiries ?? []) as string[];
  }, []);

  // Fetch chain data
  const fetchChain = useCallback(async (sym: string, expiry: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}&expiry=${encodeURIComponent(expiry)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as DerivativesData);
      setCountdown(30);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Init: load expiries + first chain
  useEffect(() => {
    fetchExpiries(symbol).then((exp) => {
      setExpiries(exp);
      if (exp.length > 0) {
        setSelectedExpiry(exp[0]);
        fetchChain(symbol, exp[0]);
      }
    });
  }, [symbol, fetchExpiries, fetchChain]);

  // Auto-refresh every 30s (paused when tab hidden)
  useEffect(() => {
    if (!selectedExpiry) return;
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      setCountdown((c) => {
        if (c <= 1) {
          fetchChain(symbol, selectedExpiry);
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, selectedExpiry, fetchChain]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-muted font-mono text-xs p-4">
        {loading ? "Loading…" : error ? `Error: ${error}` : `Loaded ${data?.chain.length} strikes`}
      </p>
    </div>
  );
}
```

**Step 3: Verify page renders** — navigate to `/derivatives`, should show "Loading…" then a strike count.

**Step 4: Commit**
```bash
git add app/derivatives/ components/derivatives/OptionChainPage.tsx
git commit -m "feat: derivatives page shell and OptionChainPage state skeleton"
```

---

## Task 5: `SymbolSearch` component

**Files:**
- Create: `components/derivatives/SymbolSearch.tsx`

**Step 1: Create component**

```tsx
// components/derivatives/SymbolSearch.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

const PINNED = ["NIFTY", "BANKNIFTY", "FINNIFTY"];

interface Props {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

export function SymbolSearch({ symbol, onSymbolChange }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const validate = async (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (!s) return;
    setValidating(true);
    setInvalid(false);
    const res = await fetch(`/api/option-chain/expiries?symbol=${s}`);
    const json = await res.json();
    setValidating(false);
    if ((json.expiries ?? []).length > 0) {
      onSymbolChange(s);
      setOpen(false);
      setInput("");
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-primary font-mono text-sm hover:border-amber/50 transition-colors"
      >
        <Search size={14} className="text-muted" />
        <span className="font-semibold text-amber">{symbol}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-64 bg-surface border border-border rounded-lg shadow-2xl shadow-black/50 p-3 flex flex-col gap-2">
          {/* Pinned symbols */}
          <div className="flex gap-1.5 flex-wrap">
            {PINNED.map((s) => (
              <button
                key={s}
                onClick={() => { onSymbolChange(s); setOpen(false); }}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs font-mono transition-colors",
                  s === symbol
                    ? "bg-amber/20 text-amber border border-amber/30"
                    : "bg-surface-raised text-muted hover:text-primary border border-border"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setInvalid(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") validate(input); }}
              placeholder="Type symbol (e.g. RELIANCE)"
              className={clsx(
                "w-full bg-base border rounded-md px-3 py-1.5 font-mono text-xs text-primary placeholder:text-muted outline-none transition-colors",
                invalid ? "border-danger" : "border-border focus:border-amber/50"
              )}
            />
            {invalid && <p className="text-danger text-[11px] mt-1 font-mono">No options found for this symbol</p>}
            <button
              onClick={() => validate(input)}
              disabled={validating || !input}
              className="mt-2 w-full py-1.5 rounded-md bg-amber/15 text-amber text-xs font-mono border border-amber/30 hover:bg-amber/20 disabled:opacity-40 transition-colors"
            >
              {validating ? "Checking…" : "Load Chain →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Wire into OptionChainPage header — replace the `<p>` debug line with:**

```tsx
import { SymbolSearch } from "./SymbolSearch";

// Inside OptionChainPage return, replace debug <p> with:
<div className="flex items-center gap-3 px-4 pt-4">
  <SymbolSearch symbol={symbol} onSymbolChange={setSymbol} />
</div>
```

**Step 3: Verify** — clicking the symbol button opens dropdown with NIFTY/BANKNIFTY/FINNIFTY pills and a search input.

**Step 4: Commit**
```bash
git add components/derivatives/SymbolSearch.tsx components/derivatives/OptionChainPage.tsx
git commit -m "feat: SymbolSearch component with pinned indices + free-form NSE lookup"
```

---

## Task 6: `ExpiryStrip` component

**Files:**
- Create: `components/derivatives/ExpiryStrip.tsx`

**Step 1: Create component**

```tsx
// components/derivatives/ExpiryStrip.tsx
"use client";

import { useRef } from "react";
import { clsx } from "clsx";

interface Props {
  expiries: string[];
  selected: string;
  onSelect: (expiry: string) => void;
}

// Group expiries by month label: "17 Mar 2026" → "Mar"
function groupByMonth(expiries: string[]): { month: string; dates: string[] }[] {
  const groups: Map<string, string[]> = new Map();
  for (const e of expiries) {
    const parts = e.split("-"); // "17-Mar-2026"
    const key = `${parts[1]} '${parts[2].slice(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).map(([month, dates]) => ({ month, dates }));
}

function shortDate(expiry: string): string {
  return expiry.split("-")[0]; // "17"
}

export function ExpiryStrip({ expiries, selected, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupByMonth(expiries);

  return (
    <div ref={scrollRef} className="flex items-end gap-4 overflow-x-auto scrollbar-none pb-1">
      {groups.map(({ month, dates }) => (
        <div key={month} className="flex flex-col items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">{month}</span>
          <div className="flex gap-1">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => onSelect(d)}
                className={clsx(
                  "w-9 h-8 rounded-lg text-xs font-mono transition-all",
                  selected === d
                    ? "bg-amber/20 text-amber border border-amber/40 shadow-[0_0_8px_rgba(245,130,13,0.2)]"
                    : "text-muted hover:text-primary hover:bg-white/5 border border-transparent"
                )}
              >
                {shortDate(d)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Wire into OptionChainPage — add below the symbol search row:**

```tsx
import { ExpiryStrip } from "./ExpiryStrip";

// Inside OptionChainPage return, after SymbolSearch row:
<div className="px-4 pt-2 border-b border-border pb-3">
  <ExpiryStrip
    expiries={expiries}
    selected={selectedExpiry}
    onSelect={(e) => { setSelectedExpiry(e); fetchChain(symbol, e); }}
  />
</div>
```

**Step 3: Commit**
```bash
git add components/derivatives/ExpiryStrip.tsx components/derivatives/OptionChainPage.tsx
git commit -m "feat: ExpiryStrip with month-grouped expiry pills"
```

---

## Task 7: `ChainSummary` component

**Files:**
- Create: `components/derivatives/ChainSummary.tsx`

**Step 1: Create component**

```tsx
// components/derivatives/ChainSummary.tsx
import type { DerivativesData } from "@/lib/nse-derivatives";
import { clsx } from "clsx";

interface Props { data: DerivativesData; }

function getMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours(), m = ist.getMinutes(), total = h * 60 + m;
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}

export function ChainSummary({ data }: Props) {
  const open = getMarketOpen();
  const pcrColor = data.pcr > 1.2 ? "text-teal" : data.pcr < 0.8 ? "text-danger" : "text-primary";

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-surface/50 border-b border-border text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="text-muted">Spot</span>
        <span className="text-primary font-semibold tabular-nums">
          {data.spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">ATM IV</span>
        <span className="text-primary tabular-nums">{data.atmIV.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">PCR</span>
        <span className={clsx("tabular-nums font-semibold", pcrColor)}>{data.pcr.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">Max Pain</span>
        <span className="text-amber tabular-nums">{data.maxPain.toLocaleString("en-IN")}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <span className={clsx("w-1.5 h-1.5 rounded-full", open ? "bg-teal animate-pulse" : "bg-danger")} />
        <span className={open ? "text-teal" : "text-danger"}>{open ? "Market Open" : "Market Closed"}</span>
      </div>
      <span className="text-[#3A3E55]">
        {data.timestamp ? `Updated ${data.timestamp}` : ""}
      </span>
    </div>
  );
}
```

**Step 2: Wire into OptionChainPage — add below expiry strip (only when data is loaded):**

```tsx
import { ChainSummary } from "./ChainSummary";

// Add after ExpiryStrip div, before chain table:
{data && <ChainSummary data={data} />}
```

**Step 3: Commit**
```bash
git add components/derivatives/ChainSummary.tsx components/derivatives/OptionChainPage.tsx
git commit -m "feat: ChainSummary strip with spot/IV/PCR/MaxPain"
```

---

## Task 8: `ColumnToggle` component

**Files:**
- Create: `components/derivatives/ColumnToggle.tsx`

**Step 1: Define column config and defaults**

```tsx
// components/derivatives/ColumnToggle.tsx
"use client";

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
import { clsx } from "clsx";

export interface ColumnConfig {
  delta: boolean; gamma: boolean; theta: boolean; vega: boolean; rho: boolean;
  ltp: boolean; ask: boolean; bid: boolean;
  oi: boolean; oiChange: boolean; iv: boolean;
}

export const DEFAULT_COLUMNS: ColumnConfig = {
  delta: true, gamma: true, theta: true, vega: false, rho: false,
  ltp: true, ask: true, bid: true,
  oi: false, oiChange: false, iv: true,
};

const STORAGE_KEY = "nebula:options:columns";

export function useColumnConfig(): [ColumnConfig, (c: ColumnConfig) => void] {
  const [config, setConfig] = useState<ColumnConfig>(DEFAULT_COLUMNS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConfig({ ...DEFAULT_COLUMNS, ...JSON.parse(stored) });
    } catch { /* ignore */ }
  }, []);

  const update = (c: ColumnConfig) => {
    setConfig(c);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  };

  return [config, update];
}

interface Props { config: ColumnConfig; onChange: (c: ColumnConfig) => void; }

const GROUPS = [
  {
    label: "Greeks",
    cols: [
      { key: "delta", label: "Delta" }, { key: "gamma", label: "Gamma" },
      { key: "theta", label: "Theta" }, { key: "vega", label: "Vega" },
      { key: "rho", label: "Rho" },
    ],
  },
  {
    label: "Price",
    cols: [
      { key: "ltp", label: "LTP" }, { key: "ask", label: "Ask" }, { key: "bid", label: "Bid" },
      { key: "iv", label: "IV%" },
    ],
  },
  {
    label: "OI & Volume",
    cols: [
      { key: "oi", label: "OI" }, { key: "oiChange", label: "OI Chg" },
    ],
  },
] as const;

export function ColumnToggle({ config, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-amber/40 transition-colors text-xs font-mono"
      >
        <Settings2 size={13} />
        Columns
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-52 bg-surface border border-border rounded-lg shadow-2xl shadow-black/50 p-3 flex flex-col gap-3">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] text-muted tracking-widest uppercase mb-1.5">{g.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.cols.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={config[key as keyof ColumnConfig]}
                      onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
                      className="accent-amber w-3 h-3"
                    />
                    <span className="text-xs font-mono text-muted group-hover:text-primary">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Wire into OptionChainPage** — add `useColumnConfig` hook and include `ColumnToggle` in header row:

```tsx
import { ColumnToggle, useColumnConfig } from "./ColumnToggle";

// Inside OptionChainPage:
const [columns, setColumns] = useColumnConfig();

// In header row, after tab buttons:
<ColumnToggle config={columns} onChange={setColumns} />
```

**Step 3: Commit**
```bash
git add components/derivatives/ColumnToggle.tsx components/derivatives/OptionChainPage.tsx
git commit -m "feat: ColumnToggle with localStorage persistence"
```

---

## Task 9: `OptionChainTable` + `ChainRow`

**Files:**
- Create: `components/derivatives/OptionChainTable.tsx`
- Create: `components/derivatives/ChainRow.tsx`

**Step 1: Create `ChainRow.tsx`**

```tsx
// components/derivatives/ChainRow.tsx
import type { OptionRow } from "@/lib/nse-derivatives";
import type { ColumnConfig } from "./ColumnToggle";
import type { BarMode } from "./OptionChainPage";
import { clsx } from "clsx";

interface Props {
  row: OptionRow;
  isAtm: boolean;
  atmStrike: number;
  spot: number;
  maxBarValue: number;
  barMode: BarMode;
  columns: ColumnConfig;
}

function fmt(v: number | null, dec = 2): string {
  if (v == null) return "–";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtOI(v: number | null): string {
  if (v == null) return "–";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

const ITM_STRIPE = "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.015)_3px,rgba(255,255,255,0.015)_6px)]";

export function ChainRow({ row, isAtm, atmStrike, spot, maxBarValue, barMode, columns }: Props) {
  const ceItm = row.strikePrice < spot;
  const peItm = row.strikePrice > spot;

  const ceBar = barMode === "oi" ? row.ceOI : row.ceVol;
  const peBar = barMode === "oi" ? row.peOI : row.peVol;
  const ceBarPct = maxBarValue > 0 && ceBar != null ? Math.min((ceBar / maxBarValue) * 100, 100) : 0;
  const peBarPct = maxBarValue > 0 && peBar != null ? Math.min((peBar / maxBarValue) * 100, 100) : 0;

  const cellCls = "px-2 py-1.5 tabular-nums text-right";

  return (
    <tr
      className={clsx(
        "border-b border-border/40 text-[11px] font-mono transition-colors",
        isAtm ? "border-y border-amber/20" : "hover:bg-white/[0.015]"
      )}
    >
      {/* ── Calls side ── */}
      {columns.rho     && <td className={clsx(cellCls, ceItm && ITM_STRIPE)}>{fmt(row.ceRho, 3)}</td>}
      {columns.vega    && <td className={clsx(cellCls, ceItm && ITM_STRIPE)}>{fmt(row.ceVega, 2)}</td>}
      {columns.theta   && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-danger/80")}>{fmt(row.ceTheta, 2)}</td>}
      {columns.gamma   && <td className={clsx(cellCls, ceItm && ITM_STRIPE)}>{fmt(row.ceGamma, 4)}</td>}
      {columns.delta   && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-teal/80")}>{fmt(row.ceDelta, 2)}</td>}
      {columns.iv      && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-muted")}>{fmt(row.ceIV, 1)}</td>}
      {columns.ltp     && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-primary font-medium")}>{fmt(row.ceLTP)}</td>}
      {columns.ask     && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-muted")}>{fmt(row.ceAsk)}</td>}
      {columns.bid     && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-muted")}>{fmt(row.ceBid)}</td>}
      {columns.oi      && <td className={clsx(cellCls, ceItm && ITM_STRIPE, "text-muted")}>{fmtOI(row.ceOI)}</td>}
      {columns.oiChange && <td className={clsx(cellCls, ceItm && ITM_STRIPE, (row.ceOIChg ?? 0) > 0 ? "text-teal" : "text-danger")}>{fmtOI(row.ceOIChg)}</td>}

      {/* OI/Vol bar — calls */}
      <td className={clsx("px-0 w-28 py-0", ceItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-end pr-1">
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 h-4 bg-cyan-500/30 rounded-l-sm transition-all"
            style={{ width: `${ceBarPct}%` }}
          />
          <span className="relative z-10 text-cyan-400 text-[10px] pr-1">{fmtOI(ceBar)}</span>
        </div>
      </td>

      {/* ── Strike ── */}
      <td className="px-3 py-1.5 text-center font-semibold sticky left-0 z-10 bg-base">
        <div className={clsx(
          "relative inline-flex flex-col items-center",
          isAtm && "text-amber"
        )}>
          <span className={clsx("text-sm tabular-nums", isAtm ? "text-amber" : "text-primary/80")}>
            {row.strikePrice.toLocaleString("en-IN")}
          </span>
          {isAtm && (
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] bg-amber/20 text-amber px-1.5 py-0.5 rounded whitespace-nowrap border border-amber/30">
              {spot.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </span>
          )}
        </div>
      </td>

      {/* ── Puts side ── */}
      {/* OI/Vol bar — puts */}
      <td className={clsx("px-0 w-28 py-0", peItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-start pl-1">
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 bg-red-500/30 rounded-r-sm transition-all"
            style={{ width: `${peBarPct}%` }}
          />
          <span className="relative z-10 text-red-400 text-[10px] pl-1">{fmtOI(peBar)}</span>
        </div>
      </td>

      {columns.oiChange && <td className={clsx(cellCls, peItm && ITM_STRIPE, (row.peOIChg ?? 0) > 0 ? "text-teal" : "text-danger")}>{fmtOI(row.peOIChg)}</td>}
      {columns.oi      && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-muted")}>{fmtOI(row.peOI)}</td>}
      {columns.bid     && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-muted")}>{fmt(row.peBid)}</td>}
      {columns.ask     && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-muted")}>{fmt(row.peAsk)}</td>}
      {columns.ltp     && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-primary font-medium")}>{fmt(row.peLTP)}</td>}
      {columns.iv      && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-muted")}>{fmt(row.peIV, 1)}</td>}
      {columns.delta   && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-danger/80")}>{fmt(row.peDelta, 2)}</td>}
      {columns.gamma   && <td className={clsx(cellCls, peItm && ITM_STRIPE)}>{fmt(row.peGamma, 4)}</td>}
      {columns.theta   && <td className={clsx(cellCls, peItm && ITM_STRIPE, "text-danger/80")}>{fmt(row.peTheta, 2)}</td>}
      {columns.vega    && <td className={clsx(cellCls, peItm && ITM_STRIPE)}>{fmt(row.peVega, 2)}</td>}
      {columns.rho     && <td className={clsx(cellCls, peItm && ITM_STRIPE)}>{fmt(row.peRho, 3)}</td>}
    </tr>
  );
}
```

**Step 2: Create `OptionChainTable.tsx`**

```tsx
// components/derivatives/OptionChainTable.tsx
import type { DerivativesData } from "@/lib/nse-derivatives";
import type { ColumnConfig } from "./ColumnToggle";
import type { BarMode } from "./OptionChainPage";
import { ChainRow } from "./ChainRow";
import { clsx } from "clsx";

interface Props {
  data: DerivativesData;
  barMode: BarMode;
  columns: ColumnConfig;
}

function colHeader(label: string, sub?: string) {
  return (
    <th className="px-2 py-2 text-right text-[10px] font-mono text-muted tracking-wider font-normal whitespace-nowrap">
      {label}{sub && <span className="block text-[9px] opacity-50">{sub}</span>}
    </th>
  );
}

export function OptionChainTable({ data, barMode, columns }: Props) {
  const { chain, atmStrike, spot } = data;

  // Scale bars to max OI/Vol in visible range (±20 from ATM)
  const atmIdx = chain.findIndex((r) => r.strikePrice === atmStrike);
  const lo = Math.max(0, atmIdx - 20);
  const hi = Math.min(chain.length - 1, atmIdx + 20);
  const visible = chain.slice(lo, hi + 1);
  const maxBarValue = Math.max(
    ...visible.map((r) => Math.max(
      barMode === "oi" ? (r.ceOI ?? 0) : (r.ceVol ?? 0),
      barMode === "oi" ? (r.peOI ?? 0) : (r.peVol ?? 0),
    ))
  );

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-surface border-b border-border">
          <tr>
            {/* Calls headers */}
            <th colSpan={
              [columns.rho, columns.vega, columns.theta, columns.gamma, columns.delta,
               columns.iv, columns.ltp, columns.ask, columns.bid, columns.oi, columns.oiChange
              ].filter(Boolean).length + 1 /* bar */
            } className="px-3 py-1.5 text-center text-[10px] font-mono text-cyan-400/70 tracking-[0.2em] uppercase border-r border-border">
              Calls
            </th>
            <th className="px-3 py-1.5 text-center text-[10px] font-mono text-amber/70 tracking-[0.2em] uppercase border-x border-border">
              Strike
            </th>
            {/* Puts headers */}
            <th colSpan={
              [columns.oiChange, columns.oi, columns.bid, columns.ask, columns.ltp,
               columns.iv, columns.delta, columns.gamma, columns.theta, columns.vega, columns.rho
              ].filter(Boolean).length + 1 /* bar */
            } className="px-3 py-1.5 text-center text-[10px] font-mono text-red-400/70 tracking-[0.2em] uppercase border-l border-border">
              Puts
            </th>
          </tr>
          <tr className="border-b border-border/50">
            {/* Calls detail headers (RTL order — rightmost is closest to strike) */}
            {columns.rho      && colHeader("Rho")}
            {columns.vega     && colHeader("Vega")}
            {columns.theta    && colHeader("Theta")}
            {columns.gamma    && colHeader("Gamma")}
            {columns.delta    && colHeader("Delta")}
            {columns.iv       && colHeader("IV", "%")}
            {columns.ltp      && colHeader("LTP")}
            {columns.ask      && colHeader("Ask")}
            {columns.bid      && colHeader("Bid")}
            {columns.oi       && colHeader("OI")}
            {columns.oiChange && colHeader("OI Chg")}
            <th className="w-28 px-1 py-2 text-right text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {/* Strike */}
            <th className="px-3 py-2 text-center text-[10px] font-mono text-amber sticky left-0 bg-surface">Strike</th>
            {/* Puts detail headers */}
            <th className="w-28 px-1 py-2 text-left text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {columns.oiChange && colHeader("OI Chg")}
            {columns.oi       && colHeader("OI")}
            {columns.bid      && colHeader("Bid")}
            {columns.ask      && colHeader("Ask")}
            {columns.ltp      && colHeader("LTP")}
            {columns.iv       && colHeader("IV", "%")}
            {columns.delta    && colHeader("Delta")}
            {columns.gamma    && colHeader("Gamma")}
            {columns.theta    && colHeader("Theta")}
            {columns.vega     && colHeader("Vega")}
            {columns.rho      && colHeader("Rho")}
          </tr>
        </thead>
        <tbody>
          {chain.map((row) => (
            <ChainRow
              key={row.strikePrice}
              row={row}
              isAtm={row.strikePrice === atmStrike}
              atmStrike={atmStrike}
              spot={spot}
              maxBarValue={maxBarValue}
              barMode={barMode}
              columns={columns}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Commit**
```bash
git add components/derivatives/ChainRow.tsx components/derivatives/OptionChainTable.tsx
git commit -m "feat: OptionChainTable and ChainRow with ITM stripes, OI/Vol bars, full Greeks"
```

---

## Task 10: Wire everything into `OptionChainPage`

**Files:**
- Modify: `components/derivatives/OptionChainPage.tsx`

**Step 1: Replace the skeleton with the full assembled layout**

```tsx
// components/derivatives/OptionChainPage.tsx — full version
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import type { DerivativesData } from "@/lib/nse-derivatives";
import { SymbolSearch } from "./SymbolSearch";
import { ExpiryStrip } from "./ExpiryStrip";
import { ChainSummary } from "./ChainSummary";
import { ColumnToggle, useColumnConfig } from "./ColumnToggle";
import { OptionChainTable } from "./OptionChainTable";
import { VolatilityChart } from "./VolatilityChart";
import { clsx } from "clsx";

export type ActiveTab = "chain" | "volatility";
export type BarMode = "oi" | "volume";

export function OptionChainPage() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [data, setData] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>("chain");
  const [barMode, setBarMode] = useState<BarMode>("oi");
  const [countdown, setCountdown] = useState(30);
  const [columns, setColumns] = useColumnConfig();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchExpiries = useCallback(async (sym: string) => {
    const res = await fetch(`/api/option-chain/expiries?symbol=${sym}`);
    const json = await res.json();
    return (json.expiries ?? []) as string[];
  }, []);

  const fetchChain = useCallback(async (sym: string, expiry: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}&expiry=${encodeURIComponent(expiry)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as DerivativesData);
      setCountdown(30);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchExpiries(symbol).then((exp) => {
      setExpiries(exp);
      if (exp.length > 0) { setSelectedExpiry(exp[0]); fetchChain(symbol, exp[0]); }
    });
  }, [symbol, fetchExpiries, fetchChain]);

  useEffect(() => {
    if (!selectedExpiry) return;
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      setCountdown((c) => {
        if (c <= 1) { fetchChain(symbol, selectedExpiry); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, selectedExpiry, fetchChain]);

  const manualRefresh = () => { setCountdown(30); fetchChain(symbol, selectedExpiry); };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border flex-wrap">
        <SymbolSearch symbol={symbol} onSymbolChange={setSymbol} />

        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["chain", "volatility"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "px-4 py-1.5 text-xs font-mono capitalize transition-colors",
                tab === t ? "bg-amber/15 text-amber" : "text-muted hover:text-primary"
              )}
            >
              {t === "volatility" ? "IV Skew" : "Chain"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* OI / Volume toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-mono">
            {(["oi", "volume"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBarMode(m)}
                className={clsx(
                  "px-3 py-1.5 transition-colors uppercase",
                  barMode === m ? "bg-surface-raised text-primary" : "text-muted hover:text-primary"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <ColumnToggle config={columns} onChange={setColumns} />

          {/* Refresh countdown */}
          <button
            onClick={manualRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary text-xs font-mono transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "…" : `${countdown}s`}
          </button>
        </div>
      </div>

      {/* ── Expiry strip ── */}
      <div className="px-4 py-2 border-b border-border">
        <ExpiryStrip
          expiries={expiries}
          selected={selectedExpiry}
          onSelect={(e) => { setSelectedExpiry(e); fetchChain(symbol, e); }}
        />
      </div>

      {/* ── Summary strip ── */}
      {data && <ChainSummary data={data} />}

      {/* ── Main content ── */}
      {error && (
        <div className="flex-1 flex items-center justify-center text-danger font-mono text-sm">
          {error.includes("NSE_SESSION_REQUIRED")
            ? "NSE session expired — "
            : `Error: ${error} — `}
          <button onClick={manualRefresh} className="underline ml-1">Retry</button>
        </div>
      )}

      {!error && !data && loading && (
        <div className="flex-1 flex items-center justify-center text-muted font-mono text-sm animate-pulse">
          Loading option chain…
        </div>
      )}

      {!error && data && tab === "chain" && (
        <OptionChainTable data={data} barMode={barMode} columns={columns} />
      )}

      {!error && data && tab === "volatility" && (
        <VolatilityChart data={data} />
      )}
    </div>
  );
}
```

**Step 2: Verify in browser** — `/derivatives` should show full layout: symbol picker, expiry pills, summary strip, chain table with amber ATM row, OI bars.

**Step 3: Commit**
```bash
git add components/derivatives/OptionChainPage.tsx
git commit -m "feat: wire OptionChainPage full layout with all sub-components"
```

---

## Task 11: `VolatilityChart` (IV Skew tab)

**Files:**
- Create: `components/derivatives/VolatilityChart.tsx`

**Step 1: Create component**

```tsx
// components/derivatives/VolatilityChart.tsx
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from "recharts";
import type { DerivativesData } from "@/lib/nse-derivatives";

interface Props { data: DerivativesData; }

export function VolatilityChart({ data }: Props) {
  const chartData = data.chain
    .filter((r) => r.ceIV != null || r.peIV != null)
    .map((r) => ({
      strike: r.strikePrice,
      callIV: r.ceIV != null ? +r.ceIV.toFixed(2) : null,
      putIV: r.peIV != null ? +r.peIV.toFixed(2) : null,
    }));

  return (
    <div className="flex-1 p-4 min-h-0">
      <p className="text-muted text-xs font-mono mb-3 tracking-wider uppercase">
        IV Skew — {data.symbol} · {data.expiry}
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2235" />
          <XAxis
            dataKey="strike"
            tickFormatter={(v) => v.toLocaleString("en-IN")}
            tick={{ fill: "#7A8099", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#7A8099", fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "#1E2235" }}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{ background: "#13151E", border: "1px solid #1E2235", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 11 }}
            labelStyle={{ color: "#F0EDE8" }}
            formatter={(v: number, name: string) => [`${v}%`, name === "callIV" ? "Call IV" : "Put IV"]}
            labelFormatter={(v) => `Strike: ${Number(v).toLocaleString("en-IN")}`}
          />
          <Legend
            formatter={(v) => v === "callIV" ? "Call IV" : "Put IV"}
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
          />
          <ReferenceLine x={data.atmStrike} stroke="#F5820D" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "ATM", fill: "#F5820D", fontSize: 10, fontFamily: "JetBrains Mono" }} />
          <Line type="monotone" dataKey="callIV" stroke="#38BDF8" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="putIV" stroke="#F87171" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Verify** — click "IV Skew" tab, should see two lines (blue=calls, red=puts) with amber ATM reference line.

**Step 3: Commit**
```bash
git add components/derivatives/VolatilityChart.tsx
git commit -m "feat: VolatilityChart IV skew tab with Recharts"
```

---

## Task 12: Polish — scroll-to-ATM on load

**Files:**
- Modify: `components/derivatives/OptionChainTable.tsx`

**Step 1: Auto-scroll the table to the ATM row on data load**

Add a `ref` to the ATM row in `ChainRow.tsx` and scroll into view:

In `ChainRow.tsx`, add a `rowRef` prop for the ATM row:
```tsx
// ChainRow.tsx — add to Props:
rowRef?: React.RefObject<HTMLTableRowElement>;

// Add ref to <tr>:
<tr ref={isAtm ? rowRef : undefined} ...>
```

In `OptionChainTable.tsx`:
```tsx
import { useEffect, useRef } from "react";

// Inside OptionChainTable:
const atmRef = useRef<HTMLTableRowElement>(null);
useEffect(() => {
  if (atmRef.current) {
    atmRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}, [data.expiry, data.symbol]);

// Pass to ChainRow:
<ChainRow ... rowRef={atmRef} />
```

**Step 2: Verify** — chain auto-scrolls to ATM row on load/expiry change.

**Step 3: Final commit**
```bash
git add components/derivatives/
git commit -m "feat: auto-scroll chain table to ATM row on load"
```

---

## Verification Checklist

After all tasks complete:
- [ ] `/derivatives` loads with NIFTY chain by default
- [ ] Expiry strip shows grouped month pills; clicking changes chain
- [ ] Symbol search: BANKNIFTY loads, RELIANCE loads, INVALID shows error
- [ ] Summary strip shows spot, ATM IV, PCR, Max Pain, market status
- [ ] ATM row has amber styling, spot price label, auto-scrolled to on load
- [ ] ITM calls (left side) have diagonal stripe background
- [ ] ITM puts (right side) have diagonal stripe background
- [ ] OI/Vol toggle switches bars and numeric values
- [ ] Column toggle popover shows/hides Greeks correctly, persists across refresh
- [ ] Auto-refresh countdown ticks down and fires at 0
- [ ] Manual refresh button resets countdown and refetches
- [ ] IV Skew tab shows two lines with ATM reference line
- [ ] OmniCore and Sidebar both show Derivatives (Sigma icon)
