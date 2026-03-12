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
import https from "https";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.BREEZE_API_KEY ?? "";
const API_SECRET = process.env.BREEZE_SECRET_KEY ?? "";

const BASE_V1 = "https://api.icicidirect.com/breezeapi/api/v1";
// V2 is on a different subdomain — used for historical charts (interval="day")
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
 * GET request with a JSON body — bypasses the Fetch API's GET-body restriction.
 * Required because the Breeze /customerdetails endpoint expects GET + JSON body
 * (same as the official JS SDK which uses axios, which allows GET body).
 */
function getWithBody(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk: string) => { raw += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
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
    // Per JS SDK: GET /customerdetails with JSON body {"SessionToken", "AppKey"}.
    // No checksum required. Uses https.request to allow GET+body (axios does this;
    // Node's native fetch rejects it per the Fetch spec).
    const data = await getWithBody(`${BASE_V1}/customerdetails`, {
      SessionToken: apisession,
      AppKey: API_KEY,
    }) as {
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
      error: data.Error ?? `Status ${data.Status}`,
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

  const body: Record<string, string> = {
    interval: "day",
    from_date: `${fromDate}T07:00:00.000Z`,
    to_date: `${toDate}T07:00:00.000Z`,
    stock_code: stockCode,
    exchange_code: "NSE",
    product_type: "cash",
  };

  const ts = utcTimestamp();
  // V2 endpoint (breezeapi subdomain); params sent as GET body.
  // V2 validates interval values: "minute","5minute","30minute","day"
  // Checksum: sha256(timestamp + JSON.stringify(body) + API_SECRET)
  const headers = dataHeaders(apiSession, ts, body);
  // Remove Content-Type from dataHeaders — getWithBody adds it with Content-Length
  const { "Content-Type": _ct, ...authHeaders } = headers;

  try {
    const data = await getWithBody(
      `${BASE_V2}/historicalcharts`,
      body,
      authHeaders
    ) as {
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

    // DEBUG — remove after diagnosing
    if (!data.Success || !Array.isArray(data.Success)) {
      console.error("[Breeze] historicalcharts raw error:", JSON.stringify(data));
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
