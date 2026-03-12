/**
 * Breeze API client — ICICI Direct
 *
 * Auth flow:
 *  1. Direct user to getBreezeLoginUrl()
 *  2. ICICI redirects to /api/breeze/callback?session_token=XXX
 *  3. Callback calls generateBreezeSession(token) to validate + persist
 *  4. Subsequent calls use the stored token via getBreezeSession()
 *
 * Checksum scheme (per Breeze SDK):
 *  - Session generation : sha256(API_SECRET + session_token)
 *  - Data requests      : sha256(timestamp + pythonStr(params) + session_token)
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.BREEZE_API_KEY ?? "";
const API_SECRET = process.env.BREEZE_SECRET_KEY ?? "";

const BASE_V1 = "https://api.icicidirect.com/breezeapi/api/v1";
const BASE_V2 = "https://api.icicidirect.com/breezeapi/api/v2";

const SESSION_FILE = path.join(process.cwd(), "data", "breeze-session.json");
const CACHE_DIR = path.join(process.cwd(), "data", "breeze-cache");

// ── Session persistence ───────────────────────────────────────────────────────

interface StoredSession {
  sessionToken: string;
  savedAt: string; // ISO
}

export function getBreezeSession(): string | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    const s = JSON.parse(raw) as StoredSession;
    // Expire after 20 hours (sessions reset at midnight IST)
    const age = Date.now() - new Date(s.savedAt).getTime();
    if (age < 20 * 60 * 60 * 1000) return s.sessionToken;
    return null;
  } catch {
    return null;
  }
}

export function saveBreezeSession(sessionToken: string): void {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify({ sessionToken, savedAt: new Date().toISOString() }),
    "utf-8"
  );
}

export function clearBreezeSession(): void {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // ignore
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

/**
 * Replicate Python's str(dict) format that the Breeze SDK uses for checksums.
 * Python: str({'key': 'val'}) → "{'key': 'val'}"
 */
function pythonStr(params: Record<string, string>): string {
  const pairs = Object.entries(params)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(", ");
  return `{${pairs}}`;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf-8").digest("hex");
}

function dataHeaders(
  sessionToken: string,
  timestamp: string,
  paramsStr: string
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Checksum": `token ${sha256(timestamp + paramsStr + sessionToken)}`,
    "X-Timestamp": timestamp,
    "X-AppKey": API_KEY,
    "X-SessionToken": sessionToken,
  };
}

// ── Public auth helpers ───────────────────────────────────────────────────────

export function getBreezeLoginUrl(): string {
  return `https://api.icicidirect.com/apiuser/login?api_key=${encodeURIComponent(API_KEY)}`;
}

export async function generateBreezeSession(
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  if (!API_KEY || !API_SECRET) {
    return { success: false, error: "BREEZE_API_KEY / BREEZE_SECRET_KEY not set in .env.local" };
  }
  try {
    const checksum = sha256(API_SECRET + sessionToken);
    const ts = utcTimestamp();
    const res = await fetch(`${BASE_V1}/customerdetails`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Checksum": `token ${checksum}`,
        "X-Timestamp": ts,
        "X-AppKey": API_KEY,
        "X-SessionToken": sessionToken,
      },
    });
    const data = (await res.json()) as { Status?: number; Success?: unknown; Error?: string };
    if (data.Status === 200 || data.Success) {
      saveBreezeSession(sessionToken);
      return { success: true };
    }
    return { success: false, error: data.Error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Historical data ───────────────────────────────────────────────────────────

export interface DailyCandle {
  date: string;  // "YYYY-MM-DD"
  close: number;
}

interface CacheFile {
  symbol: string;
  fetchedAt: string;
  toDate: string;
  candles: DailyCandle[];
}

// NSE symbol → Breeze stock_code exceptions (add as discovered)
const SYMBOL_MAP: Record<string, string> = {
  BHARTIARTL: "BRTI",
  HDFCBANK: "HDBK",
  KOTAKBANK: "KTKM",
};

function safeName(symbol: string): string {
  return symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function cacheFile(symbol: string): string {
  return path.join(CACHE_DIR, `${safeName(symbol)}.json`);
}

function loadCache(symbol: string): CacheFile | null {
  try {
    const raw = fs.readFileSync(cacheFile(symbol), "utf-8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function saveCache(symbol: string, toDate: string, candles: DailyCandle[]): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file: CacheFile = { symbol, fetchedAt: new Date().toISOString(), toDate, candles };
  fs.writeFileSync(cacheFile(symbol), JSON.stringify(file), "utf-8");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function isCacheFresh(cached: CacheFile): boolean {
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  const ageHours = age / (1000 * 60 * 60);
  // If toDate is before today → historical cache never expires
  // If toDate is today       → refresh after 4 hours (market data changes intraday)
  if (cached.toDate < today()) return true;
  return ageHours < 4;
}

export async function getHistoricalData(
  symbol: string,
  fromDate: string, // "YYYY-MM-DD"
  toDate: string,   // "YYYY-MM-DD"
  sessionToken: string
): Promise<DailyCandle[] | { error: string }> {
  // Check cache
  const cached = loadCache(symbol);
  if (
    cached &&
    cached.candles.length > 0 &&
    cached.candles[0].date <= fromDate &&
    isCacheFresh(cached)
  ) {
    return cached.candles.filter((c) => c.date >= fromDate && c.date <= toDate);
  }

  const stockCode = SYMBOL_MAP[symbol.toUpperCase()] ?? symbol.toUpperCase();

  const params: Record<string, string> = {
    interval: "1day",
    from_date: `${fromDate}T07:00:00.000Z`,
    to_date: `${toDate}T07:00:00.000Z`,
    stock_code: stockCode,
    exchange_code: "NSE",
    product_type: "cash",
  };

  const ts = utcTimestamp();
  const paramsStr = pythonStr(params);
  const url = `${BASE_V2}/historicalcharts?${new URLSearchParams(params)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: dataHeaders(sessionToken, ts, paramsStr),
    });

    const data = (await res.json()) as {
      Success?: Array<{
        datetime: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>;
      Error?: string;
      Status?: number;
    };

    if (!data.Success || !Array.isArray(data.Success)) {
      return { error: data.Error ?? "Empty response from Breeze API" };
    }

    const candles: DailyCandle[] = data.Success.map((item) => ({
      date: item.datetime.split(" ")[0], // "2024-01-02 00:00:00" → "2024-01-02"
      close: item.close,
    })).sort((a, b) => a.date.localeCompare(b.date));

    saveCache(symbol, toDate, candles);
    return candles;
  } catch (err) {
    return { error: String(err) };
  }
}
