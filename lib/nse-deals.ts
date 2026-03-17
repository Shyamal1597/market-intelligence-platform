// lib/nse-deals.ts

const NSE_BASE = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

const JSON_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/market-data/block-deal",
  "X-Requested-With": "XMLHttpRequest",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const arr: string[] = h.getSetCookie
    ? h.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
  return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

function mergeCookies(...cookieStrings: string[]): string {
  const merged = new Map<string, string>();
  for (const cs of cookieStrings) {
    for (const pair of cs.split("; ")) {
      const eq = pair.indexOf("=");
      if (eq > 0) merged.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// Three-step warm-up: option-chain (sets nsit) → block-deal → bulk-deal pages
async function getNseSession(): Promise<string> {
  const r1 = await fetch(`${NSE_BASE}/option-chain`, { headers: HTML_HEADERS });
  const c1 = extractCookies(r1);

  const [r2, r3] = await Promise.allSettled([
    fetch(`${NSE_BASE}/market-data/block-deal`, {
      headers: { ...HTML_HEADERS, Cookie: c1, Referer: `${NSE_BASE}/` },
    }),
    fetch(`${NSE_BASE}/market-data/bulk-deal`, {
      headers: { ...HTML_HEADERS, Cookie: c1, Referer: `${NSE_BASE}/` },
    }),
  ]);

  const c2 = r2.status === "fulfilled" ? extractCookies(r2.value) : "";
  const c3 = r3.status === "fulfilled" ? extractCookies(r3.value) : "";

  return mergeCookies(c1, c2, c3);
}

// Convert YYYY-MM-DD → DD-MM-YYYY (NSE date format)
function toNseDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  return `${d}-${m}-${y}`;
}

function isToday(yyyymmdd: string): boolean {
  return yyyymmdd === new Date().toISOString().split("T")[0];
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type DealType = "BULK" | "BLOCK";
export type DealSide = "BUY" | "SELL" | "UNKNOWN";

export interface Deal {
  id: string;
  exchange: "NSE";
  type: DealType;
  date: string;
  symbol: string;
  companyName: string;
  client: string;
  side: DealSide;
  quantity: number;
  price: number;
  valueCr: number;
}

// ── Field extraction helpers ───────────────────────────────────────────────────
// NSE field names differ between live and historical endpoints.

function str(d: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (d[k] != null && d[k] !== "") return String(d[k]);
  return "";
}

function num(d: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(d[k]);
    if (!isNaN(v) && v !== 0) return v;
  }
  return 0;
}

function parseSide(raw: string): DealSide {
  const u = raw.toUpperCase().trim();
  if (u === "BUY" || u === "B") return "BUY";
  if (u === "SELL" || u === "S") return "SELL";
  return "UNKNOWN";
}

function mapDeals(data: Record<string, unknown>[], type: DealType): Deal[] {
  return data.map((d, i) => {
    // Live block-deal API: totalTradedVolume + lastPrice + totalTradedValue
    // Historical APIs: quantityTraded + tradePrice (or BD_* prefix variants)
    const qty = num(d,
      "quantityTraded", "totalTradedVolume", "quantity", "BD_QTY_TRD"
    );
    const price = num(d,
      "tradePrice", "lastPrice", "avgprice", "BD_TP_WATP", "price"
    );
    // For live block-deal, totalTradedValue is in rupees — convert directly
    const rawValue = num(d, "totalTradedValue");
    const valueCr = rawValue > 0
      ? rawValue / 10_000_000
      : qty && price ? (qty * price) / 10_000_000 : 0;

    const sideRaw = str(d, "buySell", "buySellType", "BD_BUY_SELL");
    // Live block-deal has session (Session 1 / Session 2) instead of date
    const rawDate = str(d, "date", "BD_DT_DATE", "tradeDate", "lastUpdateTime");
    // Normalise "17-Mar-2026 08:47:34" → "17-Mar-2026"
    const date = rawDate.includes(" ") ? rawDate.split(" ")[0] : rawDate;

    return {
      id: `NSE-${type}-${i}`,
      exchange: "NSE" as const,
      type,
      date,
      symbol: str(d, "symbol", "Symbol", "BD_SYMBOL"),
      companyName: str(d, "symbolDesc", "security", "BD_SCRIP_NAME", "companyName"),
      // Live block-deal has no client name; historical APIs usually do
      client: str(d, "clientName", "BD_CLIENT_NAME"),
      // Live block-deal has no side; historical APIs usually do
      side: sideRaw ? parseSide(sideRaw) : "UNKNOWN",
      quantity: qty,
      price,
      valueCr,
    };
  });
}

// ── NSE Bulk Deals ─────────────────────────────────────────────────────────────

async function fetchNseBulkDeals(cookie: string, date: string): Promise<Deal[]> {
  const nseDate = toNseDate(date);
  // Live: /api/bulk-deals  Historical: /api/historical/bulk-deals?from=DD-MM-YYYY&to=DD-MM-YYYY
  const url = isToday(date)
    ? `${NSE_BASE}/api/bulk-deals`
    : `${NSE_BASE}/api/historical/bulk-deals?from=${nseDate}&to=${nseDate}`;

  // Bulk-deals API uses a different referer than block-deal
  const headers = {
    ...JSON_HEADERS,
    Cookie: cookie,
    Referer: "https://www.nseindia.com/market-data/bulk-deal",
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) { console.error(`[nse-deals] bulk ${res.status}`); return []; }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      console.error("[nse-deals] bulk returned HTML — session insufficient for this endpoint");
      return [];
    }
    const json = JSON.parse(text);
    const data: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : (json.data ?? json.Data ?? json.bulkDealData ?? []);
    if (data.length > 0) console.log("[nse-deals] bulk keys:", Object.keys(data[0]));
    return mapDeals(data, "BULK");
  } catch (err) {
    console.error("[nse-deals] bulk error:", err);
    return [];
  }
}

// ── NSE Block Deals ────────────────────────────────────────────────────────────

async function fetchNseBlockDeals(cookie: string, date: string): Promise<Deal[]> {
  const nseDate = toNseDate(date);
  const url = isToday(date)
    ? `${NSE_BASE}/api/block-deal`
    : `${NSE_BASE}/api/historical/block-deals?from=${nseDate}&to=${nseDate}`;

  try {
    const res = await fetch(url, { headers: { ...JSON_HEADERS, Cookie: cookie } });
    if (!res.ok) { console.error(`[nse-deals] block ${res.status}`); return []; }
    const json = await res.json();
    const data: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : (json.data ?? json.Data ?? json.blockDealData ?? []);
    if (data.length > 0) {
      console.log("[nse-deals] block keys:", Object.keys(data[0]));
      console.log("[nse-deals] block[0]:", JSON.stringify(data[0]));
    }
    return mapDeals(data, "BLOCK");
  } catch (err) {
    console.error("[nse-deals] block error:", err);
    return [];
  }
}

// ── Main Fetch ─────────────────────────────────────────────────────────────────

export async function fetchDeals(
  date?: string,
  returnRaw = false
): Promise<{ deals: Deal[]; fetchedAt: string; raw?: unknown }> {
  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const cookie = await getNseSession();

  if (returnRaw) {
    const nseDate = toNseDate(targetDate);
    const bulkUrl = isToday(targetDate)
      ? `${NSE_BASE}/api/bulk-deals`
      : `${NSE_BASE}/api/historical/bulk-deals?from=${nseDate}&to=${nseDate}`;
    const blockUrl = isToday(targetDate)
      ? `${NSE_BASE}/api/block-deal`
      : `${NSE_BASE}/api/historical/block-deals?from=${nseDate}&to=${nseDate}`;

    const [bulkRes, blockRes] = await Promise.allSettled([
      fetch(bulkUrl, { headers: { ...JSON_HEADERS, Cookie: cookie } }).then((r) => r.json()),
      fetch(blockUrl, { headers: { ...JSON_HEADERS, Cookie: cookie } }).then((r) => r.json()),
    ]);

    return {
      deals: [],
      fetchedAt: new Date().toISOString(),
      raw: {
        bulkUrl,
        blockUrl,
        bulk: bulkRes.status === "fulfilled" ? bulkRes.value : { error: String(bulkRes.reason) },
        block: blockRes.status === "fulfilled" ? blockRes.value : { error: String(blockRes.reason) },
      },
    };
  }

  const [bulk, block] = await Promise.allSettled([
    fetchNseBulkDeals(cookie, targetDate),
    fetchNseBlockDeals(cookie, targetDate),
  ]);

  const all: Deal[] = [
    ...(bulk.status === "fulfilled" ? bulk.value : []),
    ...(block.status === "fulfilled" ? block.value : []),
  ].sort((a, b) => b.valueCr - a.valueCr);

  return { deals: all, fetchedAt: new Date().toISOString() };
}
