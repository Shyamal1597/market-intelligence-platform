# Smart Money Fusion Widget — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-powered Smart Money Signal widget to the dashboard that fuses 4 market data streams (NSE PIT insider disclosures, bulk/block deals, FII/DII flows, BSE announcements) and synthesises them via Ollama llama3.1:8b into a scorecard + 3-sentence narrative.

**Architecture:** Server-streaming approach — `/api/smart-money/[symbol]` fetches 4 streams in parallel, builds a compact prompt, and streams the Ollama response via SSE. Results are cached to `data/smart-money-cache.json` (stale after 4h). The widget renders raw data immediately (scorecard) and streams the narrative below it.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Ollama REST API (`localhost:11434`), cheerio (already installed), existing NSE session warm-up pattern from `lib/nse-derivatives.ts`.

---

## Critical Context — Read Before Touching Anything

**All edits go to `D:\Sunidhi-Intranet-Futuristic\`** — this is the `futuristic-design` branch. The dev server on port 3001 serves ONLY from this directory. Never edit `D:\Sunidhi Intranet\`.

**Dashboard widget system** (`components/dashboard/DashboardShell.tsx`):
- Widgets are registered in `DEFAULT_WIDGETS` array (line 47)
- `page.tsx` passes a `children` object keyed by widget id
- New widget must be added to BOTH files
- `STORAGE_KEY = "dashboard_layout_v2"` — localStorage persists widget positions
- New widgets get backfilled via the `savedIds` check in `loadLayout()` and will appear at the end. Position it in `DEFAULT_WIDGETS` right after `"metrics"` so it defaults below market metrics.

**FII/DII data** (`data/fii-dii-history.json`):
- Aggregate market-wide data only — `{ date, fiiEquityNet, diiEquityNet, ... }` in Cr
- NOT symbol or sector-specific — use as market context ("FIIs net sold ₹3,295 Cr that day")
- Read last 5 entries from the JSON file directly in the API route

**NSE PIT (Insider Trading) API:**
```
GET https://www.nseindia.com/api/corporates-pit?index=equities&symbol=SBIN&from_date=01-03-2026&to_date=18-03-2026
```
- Uses NSE symbol directly (no BSE code mapping needed)
- Requires NSE session warm-up: same pattern as `lib/nse-derivatives.ts` → `getNseSession()`
- Response: `{ data: [{ acqName, personCategory, secAcquired, befAcqSharesNo, befAcqSharesPer, afterAcqSharesNo, afterAcqSharesPer, date, symbol }] }`

**Ollama streaming:**
```
POST http://localhost:11434/api/generate
{ "model": "llama3.1:8b", "prompt": "...", "stream": true, "options": { "temperature": 0.3 } }
```
- Returns NDJSON — each line is `{ response: "token", done: false }`, final line `{ done: true }`
- Pipe to client as SSE: `data: <token>\n\n`

**Bulk/Block deals** — already built at `/api/deals?tab=bulk`. But for the smart money route, call the lib directly (not the HTTP route) to filter by symbol efficiently. Import `fetchNseSnapshot` from `lib/nse-deals.ts` and filter `bulk` and `block` arrays.

**BSE Filings** — already built at `/api/filings`. For smart money, call the underlying fetch directly. Check `lib/` for the filings fetcher or read `app/api/filings/route.ts` to understand how to reuse it.

---

## Task 1: NSE PIT Insider API Route

**Files:**
- Create: `app/api/insider/[symbol]/route.ts`

**Step 1: Read the NSE derivatives lib to understand the session warm-up pattern**

```bash
# Read this file — copy the getNseSession() pattern exactly
cat D:/Sunidhi-Intranet-Futuristic/lib/nse-derivatives.ts | head -80
```

**Step 2: Create the insider route**

```typescript
// app/api/insider/[symbol]/route.ts
import { NextRequest, NextResponse } from "next/server";

export interface InsiderDisclosure {
  name: string;
  category: string;          // e.g. "Promoter", "Director", "Key Managerial Personnel"
  sharesTransacted: number;
  transactionType: "Buy" | "Sell" | "Pledge" | "Other";
  beforePct: number;
  afterPct: number;
  date: string;
}

const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
};

async function getNseInsiderSession(): Promise<string> {
  // Warm up NSE session — get cookies
  const r1 = await fetch("https://www.nseindia.com/companies-listing/corporate-filings-insider-trading", {
    headers: NSE_HEADERS,
  });
  const cookies = r1.headers.get("set-cookie") ?? "";
  return cookies;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const cookies = await getNseInsiderSession();

    // Date range: last 90 days
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 90);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    const url = `https://www.nseindia.com/api/corporates-pit?index=equities&symbol=${encodeURIComponent(symbol)}&from_date=${fmt(from)}&to_date=${fmt(to)}`;

    const res = await fetch(url, {
      headers: {
        ...NSE_HEADERS,
        Cookie: cookies,
        Referer: "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ disclosures: [] });
    }

    const json = await res.json();
    const raw = json.data ?? [];

    const disclosures: InsiderDisclosure[] = raw.slice(0, 5).map((r: Record<string, string | number>) => ({
      name: String(r.acqName ?? ""),
      category: String(r.personCategory ?? ""),
      sharesTransacted: Number(r.secAcquired ?? 0),
      transactionType: String(r.buyOrSell ?? "Other") as InsiderDisclosure["transactionType"],
      beforePct: Number(r.befAcqSharesPer ?? 0),
      afterPct: Number(r.afterAcqSharesPer ?? 0),
      date: String(r.date ?? ""),
    }));

    return NextResponse.json({ disclosures });
  } catch {
    return NextResponse.json({ disclosures: [] });
  }
}
```

**Step 3: Verify manually**

With dev server running at port 3001:
```
curl http://localhost:3001/api/insider/SBIN
```
Expected: `{ disclosures: [...] }` with up to 5 recent insider disclosures. Empty array is acceptable if no recent activity.

**Step 4: Commit**
```bash
cd D:/Sunidhi-Intranet-Futuristic
git add app/api/insider/
git commit -m "feat(smart-money): NSE PIT insider disclosures API route"
```

---

## Task 2: Smart Money Lib — Types, Cache, Prompt Builder

**Files:**
- Create: `lib/smart-money.ts`
- Create: `data/smart-money-cache.json` (empty init)

**Step 1: Read the existing nse-deals lib to understand the Deal type**
```bash
head -50 D:/Sunidhi-Intranet-Futuristic/lib/nse-deals.ts
```

**Step 2: Create the lib**

```typescript
// lib/smart-money.ts
import fs from "fs";
import path from "path";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FiiDiiDay {
  date: string;
  fiiEquityNet: number;
  diiEquityNet: number;
}

export interface StreamData {
  symbol: string;
  companyName: string;
  bulkBlockDeals: {
    date: string;
    client: string;
    side: string;
    quantity: number;
    valueCr: number;
  }[];
  announcements: {
    date: string;
    title: string;
  }[];
  fiiDii: FiiDiiDay[];        // last 5 days, market-wide
  insiders: InsiderDisclosure[];
}

export interface CachedSignal {
  symbol: string;
  companyName: string;
  rawData: StreamData;        // for immediate scorecard render
  narrative: string;          // full Ollama output
  generatedAt: string;        // ISO timestamp
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(process.cwd(), "data", "smart-money-cache.json");
const STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

type CacheStore = Record<string, CachedSignal>;

export function readCache(): CacheStore {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

export function writeCache(store: CacheStore): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(store, null, 2));
  } catch { /* disk error — silent */ }
}

export function getCached(symbol: string): CachedSignal | null {
  const store = readCache();
  const entry = store[symbol.toUpperCase()];
  if (!entry) return null;
  const age = Date.now() - new Date(entry.generatedAt).getTime();
  return age < STALE_MS ? entry : null;
}

export function setCached(signal: CachedSignal): void {
  const store = readCache();
  store[signal.symbol.toUpperCase()] = signal;
  writeCache(store);
}

// ── FII/DII reader ─────────────────────────────────────────────────────────────

const FII_DII_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");

export function getRecentFiiDii(days = 5): FiiDiiDay[] {
  try {
    const raw = fs.readFileSync(FII_DII_PATH, "utf-8");
    const all = JSON.parse(raw) as FiiDiiDay[];
    return all.slice(-days);
  } catch {
    return [];
  }
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────

export function buildPrompt(data: StreamData): string {
  const { symbol, companyName, bulkBlockDeals, announcements, fiiDii, insiders } = data;

  const dealsBlock = bulkBlockDeals.length
    ? bulkBlockDeals.map(d =>
        `${d.date} | ${d.client} | ${d.side} | ${(d.quantity / 1e7).toFixed(2)}Cr shares | ₹${d.valueCr.toFixed(1)}Cr`
      ).join("\n")
    : "No bulk/block deals in last 7 days";

  const announcementsBlock = announcements.length
    ? announcements.map(a => `${a.date}: ${a.title}`).join("\n")
    : "No recent announcements";

  const fiiBlock = fiiDii.length
    ? fiiDii.map(d =>
        `${d.date}: FII net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
      ).join("\n")
    : "No FII/DII data";

  const insidersBlock = insiders.length
    ? insiders.map(i =>
        `${i.date}: ${i.name} (${i.category}) — ${i.transactionType} ${i.sharesTransacted.toLocaleString()} shares | holding: ${i.beforePct.toFixed(2)}% → ${i.afterPct.toFixed(2)}%`
      ).join("\n")
    : "No insider disclosures in last 90 days";

  return `You are a senior equity analyst assistant for Sunidhi Capital, an Indian research firm.

Synthesise the market intelligence below for ${symbol} (${companyName}) into a Smart Money Signal report.

RULES:
- Only use the data provided. Never invent figures, names, or events.
- If a stream has no data, mark it "—" and exclude it from the verdict.
- Be specific: name entities, cite rupee figures, reference dates from the data.
- Convergence across streams = stronger signal. Flag divergence explicitly.

OUTPUT FORMAT (follow exactly):

## Stream Scorecard
| Stream            | Signal   | Key Fact |
|-------------------|----------|----------|
| Insider Activity  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| Bulk/Block Deals  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| FII/DII Flows     | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| BSE Announcements | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |

## Smart Money Signal
Write exactly 3 sentences:

Sentence 1 — LEAD: Who is the dominant actor and what are they doing? Name figures. Be specific.
Sentence 2 — CONNECT: What does a second stream confirm or contradict? If streams conflict, say so plainly — do not paper over divergence.
Sentence 3 — IMPLICATION: What does this combination suggest directionally? Do not hedge with "may" or "could" unless Confidence is LOW.

Write as if briefing a portfolio manager verbally. No jargon. No bullet points inside this section.

## Confidence: HIGH / MEDIUM / LOW
[HIGH = 3+ streams agree | MEDIUM = 2 streams agree or thin data | LOW = streams conflict or data sparse]
Reason: [one sentence]

--- MARKET DATA ---

BULK/BLOCK DEALS (last 7 days):
${dealsBlock}

BSE ANNOUNCEMENTS (recent):
${announcementsBlock}

FII/DII MARKET FLOWS (last 5 days, aggregate market-wide):
${fiiBlock}

INSIDER TRADING DISCLOSURES (last 90 days):
${insidersBlock}

--- END ---`;
}
```

**Step 3: Create empty cache file**

```bash
echo "{}" > D:/Sunidhi-Intranet-Futuristic/data/smart-money-cache.json
```

**Step 4: Commit**
```bash
cd D:/Sunidhi-Intranet-Futuristic
git add lib/smart-money.ts data/smart-money-cache.json
git commit -m "feat(smart-money): lib — types, cache helpers, prompt builder"
```

---

## Task 3: Smart Money API Route (Streaming)

**Files:**
- Create: `app/api/smart-money/[symbol]/route.ts`
- Read first: `app/api/filings/route.ts` (to understand how to reuse BSE filings fetch)
- Read first: `lib/nse-deals.ts` (to understand fetchNseSnapshot export)

**Step 1: Read the filings route to find the underlying fetch function**
```bash
cat D:/Sunidhi-Intranet-Futuristic/app/api/filings/route.ts
```

**Step 2: Read nse-deals.ts to confirm fetchNseSnapshot signature**
```bash
cat D:/Sunidhi-Intranet-Futuristic/lib/nse-deals.ts
```

**Step 3: Create the streaming route**

```typescript
// app/api/smart-money/[symbol]/route.ts
import { NextRequest } from "next/server";
import {
  buildPrompt,
  getCached,
  setCached,
  getRecentFiiDii,
  type StreamData,
  type CachedSignal,
} from "@/lib/smart-money";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchDealsForSymbol(symbol: string) {
  // Import dynamically to avoid circular deps — call the NSE snapshot directly
  const { fetchNseSnapshot } = await import("@/lib/nse-deals");
  try {
    const snapshot = await fetchNseSnapshot();
    const all = [...(snapshot.bulk ?? []), ...(snapshot.block ?? [])];
    return all
      .filter(d => d.symbol?.toUpperCase() === symbol.toUpperCase())
      .slice(0, 5)
      .map(d => ({
        date: d.date ?? "",
        client: d.client ?? "—",
        side: d.side ?? "—",
        quantity: d.quantity ?? 0,
        valueCr: d.valueCr ?? 0,
      }));
  } catch {
    return [];
  }
}

async function fetchAnnouncementsForSymbol(symbol: string) {
  try {
    // Fetch from the internal filings API — this already has BSE session handling
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
    const res = await fetch(`${baseUrl}/api/filings?search=${encodeURIComponent(symbol)}&limit=10`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const filings = json.filings ?? json.data ?? json ?? [];
    return (filings as Record<string, string>[]).slice(0, 5).map((f) => ({
      date: f.date ?? f.pubDate ?? "",
      title: f.description ?? f.title ?? f.subject ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchInsiders(symbol: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
    const res = await fetch(`${baseUrl}/api/insider/${encodeURIComponent(symbol)}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.disclosures ?? [];
  } catch {
    return [];
  }
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const force = req.nextUrl.searchParams.get("force") === "1";

  // Return cached signal if fresh
  if (!force) {
    const cached = getCached(upper);
    if (cached) {
      return new Response(JSON.stringify({ cached: true, signal: cached }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fetch all 4 streams in parallel
  const [deals, announcements, insiders, fiiDii] = await Promise.all([
    fetchDealsForSymbol(upper),
    fetchAnnouncementsForSymbol(upper),
    fetchInsiders(upper),
    Promise.resolve(getRecentFiiDii(5)),
  ]);

  const companyName = deals[0] ? "" : upper; // will be enriched later if needed

  const streamData: StreamData = {
    symbol: upper,
    companyName: upper,
    bulkBlockDeals: deals,
    announcements,
    fiiDii,
    insiders,
  };

  const prompt = buildPrompt(streamData);

  // Stream Ollama response as SSE
  const encoder = new TextEncoder();
  let fullNarrative = "";

  const stream = new ReadableStream({
    async start(controller) {
      // First: send raw data immediately so client can render scorecard
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "raw", data: streamData })}\n\n`)
      );

      try {
        const ollamaRes = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.1:8b",
            prompt,
            stream: true,
            options: { temperature: 0.3 },
          }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Ollama unavailable" })}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = ollamaRes.body.getReader();
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = dec.decode(value).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const chunk = JSON.parse(line) as { response: string; done: boolean };
              if (chunk.response) {
                fullNarrative += chunk.response;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "token", token: chunk.response })}\n\n`)
                );
              }
              if (chunk.done) {
                // Cache the completed signal
                const signal: CachedSignal = {
                  symbol: upper,
                  companyName: upper,
                  rawData: streamData,
                  narrative: fullNarrative,
                  generatedAt: new Date().toISOString(),
                };
                setCached(signal);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "done", signal })}\n\n`)
                );
              }
            } catch { /* malformed JSON chunk — skip */ }
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Failed to connect to Ollama" })}\n\n`)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

**Step 4: Verify Ollama is running before testing**

```bash
curl http://localhost:11434/api/tags
# Expected: { "models": [{ "name": "llama3.1:8b", ... }] }
```

**Step 5: Test the route with curl (streaming)**

```bash
curl -N http://localhost:3001/api/smart-money/SBIN
# Expected: stream of SSE lines:
# data: {"type":"raw","data":{...}}
# data: {"type":"token","token":"##"}
# data: {"type":"token","token":" Stream"}
# ... many token lines ...
# data: {"type":"done","signal":{...}}
```

**Step 6: Commit**
```bash
cd D:/Sunidhi-Intranet-Futuristic
git add app/api/smart-money/
git commit -m "feat(smart-money): streaming API route — 4-stream aggregation + Ollama SSE"
```

---

## Task 4: SmartMoneyWidget Component

**Files:**
- Create: `components/dashboard/SmartMoneyWidget.tsx`
- Read first: `components/dashboard/MetricsRow.tsx` (for design patterns and Tailwind conventions)

**Step 1: Read MetricsRow for design reference**
```bash
cat D:/Sunidhi-Intranet-Futuristic/components/dashboard/MetricsRow.tsx
```

**Step 2: Create the widget**

```typescript
// components/dashboard/SmartMoneyWidget.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, RefreshCw, Search, AlertCircle } from "lucide-react";
import type { CachedSignal, StreamData } from "@/lib/smart-money";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SignalState {
  symbol: string;
  rawData: StreamData | null;
  narrative: string;
  generatedAt: string;
  streaming: boolean;
  error: string;
}

// ── Scorecard (renders from rawData immediately) ───────────────────────────────

function parseScorecard(narrative: string): { stream: string; signal: string; fact: string }[] {
  // Extract the markdown table rows from the Ollama output
  const lines = narrative.split("\n");
  const rows: { stream: string; signal: string; fact: string }[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| Stream") || line.includes("|---")) { inTable = true; continue; }
    if (inTable && line.startsWith("|")) {
      const cols = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        rows.push({ stream: cols[0], signal: cols[1], fact: cols[2] });
      }
    } else if (inTable && !line.startsWith("|")) {
      break;
    }
  }
  return rows;
}

function extractNarrative(text: string): string {
  const match = text.match(/## Smart Money Signal\n([\s\S]*?)(?=## Confidence|$)/);
  return match ? match[1].trim() : "";
}

function extractConfidence(text: string): { level: string; reason: string } {
  const match = text.match(/## Confidence:\s*(HIGH|MEDIUM|LOW)\n([\s\S]*?)$/i);
  if (!match) return { level: "", reason: "" };
  return { level: match[1], reason: match[2].trim() };
}

function ConfidenceBadge({ level }: { level: string }) {
  const colours: Record<string, string> = {
    HIGH: "bg-teal/10 text-teal border-teal/20",
    MEDIUM: "bg-amber/10 text-amber border-amber/20",
    LOW: "bg-danger/10 text-danger border-danger/20",
  };
  const cls = colours[level.toUpperCase()] ?? "bg-surface text-muted border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cls}`}>
      {level}
    </span>
  );
}

function RawScorecard({ data }: { data: StreamData }) {
  const rows = [
    {
      label: "Insider Activity",
      value: data.insiders.length
        ? `${data.insiders.length} disclosure${data.insiders.length > 1 ? "s" : ""} — latest: ${data.insiders[0]?.transactionType ?? "—"}`
        : "No recent disclosures",
      signal: data.insiders.length ? (
        (data.insiders[0] as InsiderDisclosure).transactionType === "Buy" ? "🟢" : "🔴"
      ) : "—",
    },
    {
      label: "Bulk/Block Deals",
      value: data.bulkBlockDeals.length
        ? `${data.bulkBlockDeals.length} deal${data.bulkBlockDeals.length > 1 ? "s" : ""} — ₹${data.bulkBlockDeals.reduce((s, d) => s + d.valueCr, 0).toFixed(1)}Cr`
        : "No deals found",
      signal: data.bulkBlockDeals.length ? "⚪" : "—",
    },
    {
      label: "FII/DII Flows",
      value: data.fiiDii.length
        ? `FII ${data.fiiDii[data.fiiDii.length - 1].fiiEquityNet >= 0 ? "+" : ""}${data.fiiDii[data.fiiDii.length - 1].fiiEquityNet.toFixed(0)}Cr (latest day)`
        : "No data",
      signal: data.fiiDii.length
        ? (data.fiiDii[data.fiiDii.length - 1].fiiEquityNet >= 0 ? "🟢" : "🔴")
        : "—",
    },
    {
      label: "BSE Announcements",
      value: data.announcements.length
        ? `${data.announcements.length} recent — ${data.announcements[0]?.title?.slice(0, 40) ?? ""}…`
        : "No announcements",
      signal: data.announcements.length ? "⚪" : "—",
    },
  ];

  return (
    <table className="w-full text-[10px] font-mono mb-3">
      <thead>
        <tr className="border-b border-border text-muted uppercase tracking-widest">
          <th className="text-left font-normal py-1.5 pr-3">Stream</th>
          <th className="text-center font-normal py-1.5 w-8">Signal</th>
          <th className="text-left font-normal py-1.5 pl-2">Key Fact</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b border-border/40">
            <td className="py-1.5 pr-3 text-muted whitespace-nowrap">{r.label}</td>
            <td className="py-1.5 text-center">{r.signal}</td>
            <td className="py-1.5 pl-2 text-primary truncate max-w-[280px]">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Signal Card ────────────────────────────────────────────────────────────────

function SignalCard({
  state,
  onRefresh,
}: {
  state: SignalState;
  onRefresh: (symbol: string) => void;
}) {
  const confidence = extractConfidence(state.narrative);
  const narrativeText = extractNarrative(state.narrative);
  const scorecardRows = parseScorecard(state.narrative);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-3">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-primary font-semibold text-sm font-mono">{state.symbol}</span>
          {confidence.level && (
            <span className="ml-2"><ConfidenceBadge level={confidence.level} /></span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.generatedAt && (
            <span className="text-muted text-[10px] font-mono">
              {new Date(state.generatedAt).toLocaleTimeString("en-IN")}
            </span>
          )}
          <button
            onClick={() => onRefresh(state.symbol)}
            disabled={state.streaming}
            className="text-muted hover:text-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${state.streaming ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Raw scorecard — renders immediately from stream data */}
      {state.rawData && !scorecardRows.length && (
        <RawScorecard data={state.rawData} />
      )}

      {/* LLM scorecard — replaces raw once Ollama output is available */}
      {scorecardRows.length > 0 && (
        <table className="w-full text-[10px] font-mono mb-3">
          <thead>
            <tr className="border-b border-border text-muted uppercase tracking-widest">
              <th className="text-left font-normal py-1.5 pr-3">Stream</th>
              <th className="text-center font-normal py-1.5 w-8">Signal</th>
              <th className="text-left font-normal py-1.5 pl-2">Key Fact</th>
            </tr>
          </thead>
          <tbody>
            {scorecardRows.map(r => (
              <tr key={r.stream} className="border-b border-border/40">
                <td className="py-1.5 pr-3 text-muted whitespace-nowrap">{r.stream}</td>
                <td className="py-1.5 text-center">{r.signal}</td>
                <td className="py-1.5 pl-2 text-primary">{r.fact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Narrative */}
      {state.streaming && !narrativeText && (
        <div className="flex items-center gap-2 text-muted text-xs font-mono py-2">
          <span className="animate-pulse">●</span> Generating insight…
        </div>
      )}
      {narrativeText && (
        <p className="text-primary text-[11px] font-mono leading-relaxed">
          {narrativeText}
          {state.streaming && <span className="animate-pulse text-amber">▋</span>}
        </p>
      )}
      {confidence.reason && !state.streaming && (
        <p className="text-muted text-[10px] font-mono mt-2 italic">{confidence.reason}</p>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex items-center gap-2 text-danger text-[10px] font-mono mt-2">
          <AlertCircle className="w-3 h-3" /> {state.error}
        </div>
      )}
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

// Default watchlist — these are pre-analysed on page load
const DEFAULT_WATCHLIST = ["SBIN", "RELIANCE", "HDFCBANK", "INFY", "AXISBANK"];

export function SmartMoneyWidget() {
  const [signals, setSignals] = useState<Record<string, SignalState>>({});
  const [searchValue, setSearchValue] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const streamSignal = useCallback(async (symbol: string, isSearch = false) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper) return;

    // Abort any existing stream for this symbol
    abortRefs.current[upper]?.abort();
    const ctrl = new AbortController();
    abortRefs.current[upper] = ctrl;

    setSignals(prev => ({
      ...prev,
      [upper]: {
        symbol: upper,
        rawData: null,
        narrative: "",
        generatedAt: "",
        streaming: true,
        error: "",
      },
    }));

    if (isSearch) setSearchLoading(true);

    try {
      const res = await fetch(`/api/smart-money/${upper}`, { signal: ctrl.signal });

      // If cached, handle as JSON
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json() as { cached: boolean; signal: CachedSignal };
        if (json.cached && json.signal) {
          setSignals(prev => ({
            ...prev,
            [upper]: {
              symbol: upper,
              rawData: json.signal.rawData,
              narrative: json.signal.narrative,
              generatedAt: json.signal.generatedAt,
              streaming: false,
              error: "",
            },
          }));
        }
        return;
      }

      // SSE stream
      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = dec.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6)) as {
              type: string;
              data?: StreamData;
              token?: string;
              signal?: CachedSignal;
              message?: string;
            };

            if (msg.type === "raw" && msg.data) {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], rawData: msg.data! },
              }));
            } else if (msg.type === "token" && msg.token) {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], narrative: (prev[upper]?.narrative ?? "") + msg.token },
              }));
            } else if (msg.type === "done" && msg.signal) {
              setSignals(prev => ({
                ...prev,
                [upper]: {
                  ...prev[upper],
                  narrative: msg.signal!.narrative,
                  generatedAt: msg.signal!.generatedAt,
                  streaming: false,
                },
              }));
            } else if (msg.type === "error") {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], streaming: false, error: msg.message ?? "Error" },
              }));
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSignals(prev => ({
        ...prev,
        [upper]: { ...(prev[upper] ?? { symbol: upper, rawData: null, narrative: "", generatedAt: "" }), streaming: false, error: "Failed to load signal." },
      }));
    } finally {
      if (isSearch) setSearchLoading(false);
    }
  }, []);

  // Load watchlist sequentially on mount
  useEffect(() => {
    let cancelled = false;
    async function loadSequentially() {
      for (const symbol of DEFAULT_WATCHLIST) {
        if (cancelled) break;
        await streamSignal(symbol);
        // Small gap between requests to avoid hammering Ollama
        await new Promise(r => setTimeout(r, 500));
      }
    }
    loadSequentially();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const sym = searchValue.trim().toUpperCase();
    if (!sym) return;
    streamSignal(sym, true);
    setSearchValue("");
  }

  // Show on-demand (non-watchlist) results first, then watchlist
  const watchlistSet = new Set(DEFAULT_WATCHLIST);
  const onDemandSymbols = Object.keys(signals).filter(s => !watchlistSet.has(s));
  const displayOrder = [...onDemandSymbols, ...DEFAULT_WATCHLIST];

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber" />
          <h2 className="font-display text-lg font-semibold text-primary tracking-tight">
            Smart Money Signals
          </h2>
        </div>
        <span className="text-[10px] font-mono text-muted">Ollama · llama3.1:8b</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value.toUpperCase())}
            placeholder="Analyse any symbol…"
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-base border border-border rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-amber/50"
          />
        </div>
        <button
          type="submit"
          disabled={!searchValue.trim() || searchLoading}
          className="px-3 py-2 text-[11px] font-mono bg-amber/10 text-amber border border-amber/20 rounded-lg hover:bg-amber/20 transition-colors disabled:opacity-40"
        >
          {searchLoading ? "…" : "Go"}
        </button>
      </form>

      {/* Signal cards */}
      <div>
        {displayOrder.map(symbol =>
          signals[symbol] ? (
            <SignalCard
              key={symbol}
              state={signals[symbol]}
              onRefresh={sym => streamSignal(sym, false)}
            />
          ) : (
            <div key={symbol} className="bg-surface border border-border/40 rounded-xl p-4 mb-3 animate-pulse">
              <div className="h-3 bg-border/40 rounded w-24 mb-3" />
              <div className="h-2 bg-border/40 rounded w-full mb-2" />
              <div className="h-2 bg-border/40 rounded w-3/4" />
            </div>
          )
        )}
      </div>
    </div>
  );
}
```

**Step 3: Check for TypeScript errors**

```bash
cd D:/Sunidhi-Intranet-Futuristic
npx tsc --noEmit 2>&1 | head -40
```

Fix any errors before proceeding.

**Step 4: Commit**
```bash
git add components/dashboard/SmartMoneyWidget.tsx
git commit -m "feat(smart-money): SmartMoneyWidget component — scorecard + streaming narrative"
```

---

## Task 5: Wire Into Dashboard

**Files:**
- Modify: `components/dashboard/DashboardShell.tsx` — add to `DEFAULT_WIDGETS`
- Modify: `app/page.tsx` — add `smartmoney` slot

**Step 1: Add to DEFAULT_WIDGETS in DashboardShell.tsx**

In `DashboardShell.tsx` at line 47, add the new widget **right after `"metrics"`** so it defaults below the market metrics widget:

```typescript
const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "metrics",     label: "Market Metrics",      visible: true, size: "normal", width: "full" },
  { id: "smartmoney",  label: "Smart Money Signals",  visible: true, size: "normal", width: "full" }, // ← add this
  { id: "news",        label: "Market News",          visible: true, size: "normal", width: "full" },
  { id: "filings",     label: "BSE Filings",          visible: true, size: "normal", width: "full" },
  { id: "sectors",     label: "Sector Leaders",       visible: true, size: "normal", width: "full" },
  { id: "preview",     label: "Quick Access",         visible: true, size: "normal", width: "full" },
];
```

Also bump `STORAGE_KEY` from `"dashboard_layout_v2"` to `"dashboard_layout_v3"` so existing localStorage doesn't suppress the new widget.

**Step 2: Add slot in page.tsx**

```typescript
import { SmartMoneyWidget } from "@/components/dashboard/SmartMoneyWidget";

export default function DashboardPage() {
  return (
    <div className="p-2 pt-8">
      <DashboardShell>
        {{
          metrics:     <MetricsRow />,
          smartmoney:  <SmartMoneyWidget />,   // ← add this
          news:        <NewsHeadlines />,
          filings:     <DashboardFilings />,
          sectors:     <SectorLeadersPreview />,
          preview:     <DashboardDataPreview />,
        }}
      </DashboardShell>
    </div>
  );
}
```

**Step 3: TypeScript check**
```bash
cd D:/Sunidhi-Intranet-Futuristic
npx tsc --noEmit 2>&1 | head -40
```

**Step 4: Verify in browser**

Navigate to `http://localhost:3001`. The Smart Money Signals widget should appear below Market Metrics. Watchlist cards should start loading sequentially — raw scorecard appears in ~1s, narrative streams in over 5-10s per symbol.

**Step 5: Commit**
```bash
git add components/dashboard/DashboardShell.tsx app/page.tsx
git commit -m "feat(smart-money): wire widget into dashboard below market metrics"
```

---

## Task 6: Verify Ollama Integration End-to-End

**Step 1: Confirm Ollama model is pulled**
```bash
curl http://localhost:11434/api/tags
# Must show llama3.1:8b in the models list
# If not: ollama pull llama3.1:8b
```

**Step 2: Smoke test the full pipeline**
```bash
curl -N "http://localhost:3001/api/smart-money/RELIANCE?force=1"
# Watch for:
# 1. data: {"type":"raw",...}  — immediate
# 2. data: {"type":"token",...} — many lines streaming
# 3. data: {"type":"done",...} — final cached signal
```

**Step 3: Verify cache was written**
```bash
cat D:/Sunidhi-Intranet-Futuristic/data/smart-money-cache.json | python -m json.tool | head -30
```

**Step 4: Reload dashboard and verify cache is served (no Ollama call)**
```bash
curl http://localhost:3001/api/smart-money/RELIANCE
# Expected: {"cached":true,"signal":{...}} as plain JSON, not SSE
```

**Step 5: Final commit**
```bash
cd D:/Sunidhi-Intranet-Futuristic
git add data/smart-money-cache.json
git commit -m "feat(smart-money): initial cache seed"
```

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| NSE PIT API blocks with 403 | Fall back to empty array — widget still works with 3 streams |
| Ollama not running | Route returns `{ type: "error" }` SSE event — widget shows error state |
| llama3.1:8b ignores output format | Temperature 0.3 + explicit format in prompt reduces drift; raw scorecard always renders regardless |
| BSE filings API slow | `Promise.all` — doesn't block other streams; 5s timeout recommended |
| `smart-money-cache.json` grows unbounded | Not a concern at current scale (Nifty 500 = ~500 entries × ~5KB = 2.5MB max) |
| Dashboard localStorage conflict | Bumping `STORAGE_KEY` to `v3` forces a clean default layout for existing users |
