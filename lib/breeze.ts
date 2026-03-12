/**
 * Breeze API client — ICICI Direct
 *
 * Auth flow:
 *  1. Direct user to getBreezeLoginUrl()
 *  2. ICICI POSTs to /api/breeze/callback?apisession=XXX
 *  3. Callback calls generateBreezeSession(apisession) → GET /customerdetails
 *     Response Success.session_token (base64) is stored as the API session
 *  4. Data calls use the stored base64 session token via X-SessionToken
 *
 * Checksum scheme (per official JS SDK):
 *  - Session generation : no checksum — only Content-Type header
 *  - Data requests      : sha256(timestamp + JSON.stringify(body) + API_SECRET)
 *
 * Reference: https://github.com/Idirect-Tech/Breeze-JS-SDK
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.BREEZE_API_KEY ?? "";
const API_SECRET = process.env.BREEZE_SECRET_KEY ?? "";

const BASE_V1 = "https://api.icicidirect.com/breezeapi/api/v1";
// V2 is on a different subdomain
const BASE_V2 = "https://breezeapi.icicidirect.com/api/v2";

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

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Build headers for authenticated data API calls.
 * Checksum per JS SDK: sha256(timestamp + JSON.stringify(body) + API_SECRET)
 * X-SessionToken is the base64 session_token from customerdetails response.
 */
function dataHeaders(
  apiSession: string,
  timestamp: string,
  body: Record<string, string>
): Record<string, string> {
  const checksum = sha256(timestamp + JSON.stringify(body) + API_SECRET);
  return {
    "Content-Type": "application/json",
    "X-Checksum": `token ${checksum}`,
    "X-Timestamp": timestamp,
    "X-AppKey": API_KEY,
    "X-SessionToken": apiSession,
  };
}

// ── Public auth helpers ───────────────────────────────────────────────────────

export function getBreezeLoginUrl(): string {
  return `https://api.icicidirect.com/apiuser/login?api_key=${encodeURIComponent(API_KEY)}`;
}

export async function generateBreezeSession(
  apisession: string  // the ?apisession= token from ICICI callback
): Promise<{ success: boolean; error?: string }> {
  if (!API_KEY || !API_SECRET) {
    return { success: false, error: "BREEZE_API_KEY / BREEZE_SECRET_KEY not set in .env.local" };
  }
  try {
    // Per JS SDK: GET /customerdetails with only Content-Type header (no checksum).
    // The SDK uses axios (which allows GET body); Node fetch doesn't.
    // Send SessionToken + AppKey as query params instead.
    const qs = new URLSearchParams({ SessionToken: apisession, AppKey: API_KEY });
    const res = await fetch(`${BASE_V1}/customerdetails?${qs}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = (await res.json()) as {
      Status?: number;
      Success?: { session_token?: string };
      Error?: string;
    };

    if (data.Status === 200 && data.Success?.session_token) {
      // Success.session_token is a base64-encoded "userId:sessionKey" string.
      // This is what must be sent as X-SessionToken in subsequent data calls.
      saveBreezeSession(data.Success.session_token);
      return { success: true };
    }

    return {
      success: false,
      error: data.Error ?? `Status ${data.Status ?? res.status}`,
    };
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
  // Historical dates (before today) cache forever
  // Today's data refreshes after 4 hours
  if (cached.toDate < today()) return true;
  return ageHours < 4;
}

export async function getHistoricalData(
  symbol: string,
  fromDate: string, // "YYYY-MM-DD"
  toDate: string,   // "YYYY-MM-DD"
  apiSession: string // base64 session_token from customerdetails
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

  // Body dict — matches exactly what JS SDK sends (no product_type in checksum body)
  const body: Record<string, string> = {
    interval: "1day",
    from_date: `${fromDate}T07:00:00.000Z`,
    to_date: `${toDate}T07:00:00.000Z`,
    stock_code: stockCode,
    exchange_code: "NSE",
  };

  const ts = utcTimestamp();
  // Checksum uses JSON.stringify(body) per JS SDK
  const url = `${BASE_V2}/historicalcharts?${new URLSearchParams(body)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: dataHeaders(apiSession, ts, body),
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
      return { error: data.Error ?? `Empty response (Status ${data.Status})` };
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
