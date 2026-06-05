// lib/nse-flows.ts
//
// Data strategy:
//   1. Snapshot (today): NSE fiidiiTradeReact — requires session cookies, always works
//   2. Historical: file-based accumulation in data/fii-dii-history.json
//      - On each request, today's snapshot is appended if not yet present
//      - NSE historical API attempted as one-shot bootstrap (fails gracefully)
//   3. Nifty: Yahoo Finance — no auth required, always works

import { promises as fs } from "fs";
import path from "path";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NSE_BASE_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface FiiDiiEntry {
  date: string; // "YYYY-MM-DD"

  // Equity segment
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;

  // Debt segment (may be 0 if source doesn't provide it)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  return "";
}

/** "2025-01-01" → "01-Jan-2025" for NSE API params */
function toNseParam(iso: string): string {
  const [y, m, d] = iso.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d}-${monthNames[parseInt(m) - 1]}-${y}`;
}

function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  return parseFloat(String(v).replace(/,/g, "")) || 0;
}

type StoredEntry = Omit<FiiDiiEntry, "cumulativeFiiEquityNet" | "cumulativeDiiEquityNet" | "rollingAvg20FiiEquity" | "rollingAvg20DiiEquity">;

// ── Persistence ───────────────────────────────────────────────────────────────

const HISTORY_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");

async function loadHistory(): Promise<StoredEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveHistory(entries: StoredEntry[]): Promise<void> {
  try {
    await fs.writeFile(HISTORY_PATH, JSON.stringify(entries, null, 2), "utf-8");
  } catch (e) {
    console.error("[nse-flows] failed to save history:", e);
  }
}

// ── NSE Session ──────────────────────────────────────────────────────────────

function nseHeaders(cookie: string, referer = "https://www.nseindia.com/market-data/fii-dii-data"): Record<string, string> {
  return {
    ...NSE_BASE_HEADERS,
    Referer: referer,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function getNseCookies(): Promise<string> {
  function extractCookies(res: Response): string {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const arr: string[] = h.getSetCookie
      ? h.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
    return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  }

  const htmlHeaders = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  try {
    // Step 1: homepage — establishes base session
    const homeRes = await fetch("https://www.nseindia.com", { headers: htmlHeaders });
    const cookie = extractCookies(homeRes);

    // Step 2: warm up the FII/DII page — required for historical API access
    await fetch("https://www.nseindia.com/market-data/fii-dii-data", {
      headers: { ...htmlHeaders, Cookie: cookie, Referer: "https://www.nseindia.com/" },
    });

    return cookie;
  } catch (e) {
    console.error("[nse-flows] session error:", e);
    return "";
  }
}

// ── Today's Snapshot ─────────────────────────────────────────────────────────

interface NseSnapshotItem {
  category?: string;
  buyValue?: string | number;
  sellValue?: string | number;
  netValue?: string | number;
  [key: string]: unknown;
}

export async function fetchTodaySnapshot(cookie = ""): Promise<FlowsSnapshot | null> {
  try {
    const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: nseHeaders(cookie),
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`[nse-flows] fiidiiTradeReact HTTP ${res.status}`);
      return null;
    }

    const json: unknown = await res.json();
    const items: NseSnapshotItem[] = Array.isArray(json) ? (json as NseSnapshotItem[]) : [];

    const snap: FlowsSnapshot = {
      fiiEquityBuy: 0, fiiEquitySell: 0, fiiEquityNet: 0,
      diiEquityBuy: 0, diiEquitySell: 0, diiEquityNet: 0,
      fiiDebtBuy: 0,   fiiDebtSell: 0,   fiiDebtNet: 0,
      diiDebtBuy: 0,   diiDebtSell: 0,   diiDebtNet: 0,
    };

    // fiidiiTradeReact returns equity-only data — no "type" field present.
    for (const item of items) {
      const cat = String(item.category ?? "").toLowerCase();
      if (/fii|fpi/.test(cat)) {
        snap.fiiEquityBuy = num(item.buyValue);
        snap.fiiEquitySell = num(item.sellValue);
        snap.fiiEquityNet = num(item.netValue);
      } else if (/dii/.test(cat)) {
        snap.diiEquityBuy = num(item.buyValue);
        snap.diiEquitySell = num(item.sellValue);
        snap.diiEquityNet = num(item.netValue);
      }
    }
    return snap;
  } catch (e) {
    console.error("[nse-flows] snapshot error:", e);
    return null;
  }
}

/** Convert a snapshot + date into a StoredEntry for persistence */
function snapshotToEntry(snap: FlowsSnapshot, date: string): StoredEntry {
  return {
    date,
    fiiEquityBuy:  snap.fiiEquityBuy,
    fiiEquitySell: snap.fiiEquitySell,
    fiiEquityNet:  snap.fiiEquityNet,
    diiEquityBuy:  snap.diiEquityBuy,
    diiEquitySell: snap.diiEquitySell,
    diiEquityNet:  snap.diiEquityNet,
    fiiDebtBuy:    snap.fiiDebtBuy,
    fiiDebtSell:   snap.fiiDebtSell,
    fiiDebtNet:    snap.fiiDebtNet,
    diiDebtBuy:    snap.diiDebtBuy,
    diiDebtSell:   snap.diiDebtSell,
    diiDebtNet:    snap.diiDebtNet,
  };
}

// ── Historical Bootstrap (NSE API — best-effort) ─────────────────────────────

interface NseHistoricalItem {
  date?: string;
  fiiBuyEquity?: string | number;
  fiiSellEquity?: string | number;
  fiiNetEquity?: string | number;
  diiBuyEquity?: string | number;
  diiSellEquity?: string | number;
  diiNetEquity?: string | number;
  fiiBuyDebt?: string | number;
  fiiSellDebt?: string | number;
  fiiNetDebt?: string | number;
  diiBuyDebt?: string | number;
  diiSellDebt?: string | number;
  diiNetDebt?: string | number;
  [key: string]: unknown;
}

function parseHistoricalItem(item: NseHistoricalItem): StoredEntry | null {
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
}

/** Attempt NSE historical API (fails gracefully — NSE changes endpoints frequently) */
async function tryNseHistoricalBootstrap(
  fromIso: string,
  toIso: string,
  cookie: string
): Promise<StoredEntry[]> {
  const from = toNseParam(fromIso);
  const to = toNseParam(toIso);
  const headers = nseHeaders(cookie);

  const endpoints = [
    `https://www.nseindia.com/api/historical/fii-dii?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `https://www.nseindia.com/api/historicaldata-fiiDii?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 0 } });
      const key = url.split("/api/")[1]?.split("?")[0] ?? url;
      console.log(`[nse-flows] bootstrap ${key}: HTTP ${res.status}`);
      if (!res.ok) continue;

      const json: unknown = await res.json();
      const rawArr: unknown = Array.isArray(json)
        ? json
        : (json as Record<string, unknown>)?.data ?? [];

      if (Array.isArray(rawArr) && rawArr.length > 0) {
        const items = rawArr as NseHistoricalItem[];
        const entries = items.map(parseHistoricalItem).filter((e): e is StoredEntry => e !== null);
        console.log(`[nse-flows] bootstrap loaded ${entries.length} entries`);
        return entries;
      }
    } catch (e) {
      console.error("[nse-flows] bootstrap endpoint error:", e);
    }
  }
  return [];
}

// ── Derived Metrics ──────────────────────────────────────────────────────────

function computeDerived(entries: StoredEntry[]): FiiDiiEntry[] {
  let cumFii = 0;
  let cumDii = 0;

  return entries.map((e, i) => {
    cumFii += e.fiiEquityNet;
    cumDii += e.diiEquityNet;

    const windowStart = Math.max(0, i - 19);
    const win = entries.slice(windowStart, i + 1);
    const avgFii = win.reduce((s, x) => s + x.fiiEquityNet, 0) / win.length;
    const avgDii = win.reduce((s, x) => s + x.diiEquityNet, 0) / win.length;

    return {
      ...e,
      cumulativeFiiEquityNet: cumFii,
      cumulativeDiiEquityNet: cumDii,
      rollingAvg20FiiEquity: avgFii,
      rollingAvg20DiiEquity: avgDii,
    };
  });
}

// ── Nifty ────────────────────────────────────────────────────────────────────

export async function fetchNiftyDailyHistory(): Promise<NiftyDayClose[]> {
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1y";
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
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

// ── Gap detection ─────────────────────────────────────────────────────────────

/**
 * Returns the earliest date from which we should attempt a backfill.
 * Triggers when:
 *  a) history is completely empty, or
 *  b) there is a gap > GAP_THRESHOLD calendar days between consecutive entries
 *     within the last LOOK_BACK_DAYS window, or
 *  c) the most recent entry is more than GAP_THRESHOLD days before today.
 *
 * Returns null if the history appears complete enough.
 */
const GAP_THRESHOLD_DAYS = 7;   // gaps bigger than this (calendar days) → backfill
const LOOK_BACK_DAYS     = 120; // only inspect the last 4 months

function detectBackfillFrom(entries: StoredEntry[], today: string): string | null {
  if (entries.length === 0) {
    // Start backfill from FY start (Apr 1 of current/prev year)
    const d = new Date(today);
    const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${fyStart}-04-01`;
  }

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - LOOK_BACK_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recent = entries
    .filter((e) => e.date >= cutoffIso)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (recent.length === 0) return cutoffIso;

  // Gap between last entry and today
  const lastDate   = new Date(recent[recent.length - 1].date);
  const todayDate  = new Date(today);
  const tailGap    = Math.round(
    (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (tailGap > GAP_THRESHOLD_DAYS) {
    // Backfill from a week before the last entry to capture any missed days
    const fromDate = new Date(lastDate);
    fromDate.setDate(fromDate.getDate() - 7);
    return fromDate.toISOString().slice(0, 10);
  }

  // Internal gap > threshold
  for (let i = 1; i < recent.length; i++) {
    const prev = new Date(recent[i - 1].date);
    const curr = new Date(recent[i].date);
    const gap  = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (gap > GAP_THRESHOLD_DAYS) {
      // Backfill from a week before this gap
      const fromDate = new Date(prev);
      fromDate.setDate(fromDate.getDate() - 7);
      return fromDate.toISOString().slice(0, 10);
    }
  }

  return null; // no gaps detected
}

/**
 * Merge new entries into existing, dedup by date, return sorted.
 * New entries win over old (allows correction of stale data).
 */
function mergeEntries(existing: StoredEntry[], incoming: StoredEntry[]): StoredEntry[] {
  const map = new Map<string, StoredEntry>(existing.map((e) => [e.date, e]));
  for (const e of incoming) map.set(e.date, e); // incoming overwrites
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function fetchAllFlowData(): Promise<{
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: NiftyDayClose[];
}> {
  const today = new Date().toISOString().slice(0, 10);

  // Establish NSE session — required for non-empty API responses
  const cookie = await getNseCookies();

  // Load existing history + fetch today's snapshot + Nifty in parallel
  const [history, snapshot, nifty] = await Promise.all([
    loadHistory(),
    fetchTodaySnapshot(cookie),
    fetchNiftyDailyHistory(),
  ]);

  let entries = [...history];
  let dirty   = false;

  // Gap detection: backfill whenever the stored history has holes,
  // not just when it is completely empty. NSE API fails gracefully.
  const backfillFrom = detectBackfillFrom(entries, today);
  if (backfillFrom) {
    console.log(`[nse-flows] gap detected — attempting backfill from ${backfillFrom}`);
    const fetched = await tryNseHistoricalBootstrap(backfillFrom, today, cookie);
    if (fetched.length > 0) {
      entries = mergeEntries(entries, fetched);
      dirty   = true;
      console.log(
        `[nse-flows] backfill merged ${fetched.length} entries (total: ${entries.length})`,
      );
    } else {
      console.warn("[nse-flows] backfill attempt returned 0 entries (NSE may be blocking)");
    }
  }

  // Append today's snapshot if not already present
  if (snapshot && !entries.some((e) => e.date === today)) {
    const todayEntry = snapshotToEntry(snapshot, today);
    entries = mergeEntries(entries, [todayEntry]);
    dirty   = true;
    console.log(`[nse-flows] appended ${today} (total: ${entries.length})`);
  }

  // Persist if changed
  if (dirty) await saveHistory(entries);

  return {
    entries: computeDerived(entries),
    snapshot,
    nifty,
  };
}

// ── Manual patch endpoint helpers ─────────────────────────────────────────────

/**
 * Patch one or more historical entries directly into the history file.
 * Used by POST /api/flows/patch when the analyst needs to correct missing data.
 */
export async function patchFlowHistory(
  patches: Array<{
    date: string;
    fiiEquityBuy: number; fiiEquitySell: number; fiiEquityNet: number;
    diiEquityBuy: number; diiEquitySell: number; diiEquityNet: number;
  }>,
): Promise<{ saved: number; total: number }> {
  const history = await loadHistory();
  const incoming: StoredEntry[] = patches.map((p) => ({
    ...p,
    fiiDebtBuy: 0, fiiDebtSell: 0, fiiDebtNet: 0,
    diiDebtBuy: 0, diiDebtSell: 0, diiDebtNet: 0,
  }));
  const merged = mergeEntries(history, incoming);
  await saveHistory(merged);
  return { saved: incoming.length, total: merged.length };
}
