// lib/nse-deals.ts
// All three deal types (bulk, short, block) come from ONE snapshot endpoint:
// /api/snapshot-capital-market-largedeal → { BULK_DEALS_DATA, SHORT_DEALS_DATA, BLOCK_DEALS_DATA, as_on_date }

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

function mergeCookies(...parts: string[]): string {
  const merged = new Map<string, string>();
  for (const cs of parts) {
    for (const pair of cs.split("; ")) {
      const eq = pair.indexOf("=");
      if (eq > 0) merged.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getNseSession(): Promise<string> {
  const r1 = await fetch(`${NSE_BASE}/option-chain`, { headers: HTML_HEADERS });
  const c1 = extractCookies(r1);

  const [r2] = await Promise.allSettled([
    fetch(`${NSE_BASE}/market-data/large-deals`, {
      headers: { ...HTML_HEADERS, Cookie: c1, Referer: `${NSE_BASE}/` },
    }),
  ]);

  const c2 = r2.status === "fulfilled" ? extractCookies(r2.value) : "";
  return mergeCookies(c1, c2);
}

function toNseDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  return `${d}-${m}-${y}`;
}

// -- Types ----------------------------------------------------------------------

export type DealType = "BULK" | "BLOCK" | "SHORT";
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

// -- Field helpers --------------------------------------------------------------

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

function parseSide(raw: string | null | undefined): DealSide {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase().trim();
  if (u === "BUY" || u === "B") return "BUY";
  if (u === "SELL" || u === "S") return "SELL";
  return "UNKNOWN";
}

function mapDeals(data: Record<string, unknown>[], type: DealType): Deal[] {
  return data.map((d, i) => {
    const qty = num(d, "qty", "quantityTraded", "totalTradedVolume", "quantity");
    const price = num(d, "watp", "tradePrice", "lastPrice", "avgprice");
    const valueCr = qty && price ? (qty * price) / 10_000_000 : 0;
    const rawDate = str(d, "date", "tradeDate");
    return {
      id: `NSE-${type}-${i}`,
      exchange: "NSE" as const,
      type,
      date: rawDate.includes(" ") ? rawDate.split(" ")[0] : rawDate,
      symbol: str(d, "symbol", "Symbol"),
      companyName: str(d, "name", "symbolDesc", "security", "companyName"),
      client: str(d, "clientName"),
      side: parseSide(d["buySell"] as string | null),
      quantity: qty,
      price,
      valueCr,
    };
  });
}

// -- Snapshot fetch -------------------------------------------------------------

interface SnapshotResult {
  bulk: Deal[];
  block: Deal[];
  short: Deal[];
  asOnDate: string;
}

async function fetchSnapshot(cookie: string): Promise<SnapshotResult> {
  const url = `${NSE_BASE}/api/snapshot-capital-market-largedeal`;
  const headers = {
    ...JSON_HEADERS,
    Cookie: cookie,
    Referer: "https://www.nseindia.com/market-data/large-deals",
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[nse-deals] snapshot ${res.status}`);
      return { bulk: [], block: [], short: [], asOnDate: "" };
    }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      console.error("[nse-deals] snapshot returned HTML -- session insufficient");
      return { bulk: [], block: [], short: [], asOnDate: "" };
    }
    const json = JSON.parse(text);
    const asOnDate: string = json.as_on_date ?? "";
    const bulkData: Record<string, unknown>[] = json.BULK_DEALS_DATA ?? [];
    const blockData: Record<string, unknown>[] = json.BLOCK_DEALS_DATA ?? [];
    const shortData: Record<string, unknown>[] = json.SHORT_DEALS_DATA ?? [];
    console.log(`[nse-deals] snapshot -- bulk:${bulkData.length} block:${blockData.length} short:${shortData.length} as_on:${asOnDate}`);
    return {
      bulk: mapDeals(bulkData, "BULK"),
      block: mapDeals(blockData, "BLOCK"),
      short: mapDeals(shortData, "SHORT"),
      asOnDate,
    };
  } catch (err) {
    console.error("[nse-deals] snapshot error:", err);
    return { bulk: [], block: [], short: [], asOnDate: "" };
  }
}

// -- Historical block deals (date picker support) -------------------------------

async function fetchHistoricalBlockDeals(cookie: string, date: string): Promise<Deal[]> {
  const nseDate = toNseDate(date);
  const url = `${NSE_BASE}/api/historical/block-deals?from=${nseDate}&to=${nseDate}`;
  const headers = {
    ...JSON_HEADERS,
    Cookie: cookie,
    Referer: "https://www.nseindia.com/market-data/large-deals",
  };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) { console.error(`[nse-deals] hist-block ${res.status}`); return []; }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) { console.error("[nse-deals] hist-block returned HTML"); return []; }
    const json = JSON.parse(text);
    const data: Record<string, unknown>[] = Array.isArray(json)
      ? json : (json.data ?? json.BLOCK_DEALS_DATA ?? []);
    console.log(`[nse-deals] hist-block -- ${data.length} records`);
    return mapDeals(data, "BLOCK");
  } catch (err) {
    console.error("[nse-deals] hist-block error:", err);
    return [];
  }
}

// -- Public Exports -------------------------------------------------------------

/**
 * Fetch all three deal types (bulk, block, short) in a single NSE session.
 * Prefer this over calling fetchBulkDeals/fetchBlockDeals/fetchShortDeals separately --
 * each of those opens its own NSE session, tripling the round-trips.
 */
export async function fetchAllDeals(): Promise<{
  bulk: Deal[];
  block: Deal[];
  short: Deal[];
  asOnDate: string;
  fetchedAt: string;
}> {
  const cookie = await getNseSession();
  const { bulk, block, short, asOnDate } = await fetchSnapshot(cookie);
  return { bulk, block, short, asOnDate, fetchedAt: new Date().toISOString() };
}

export async function fetchBulkDeals(): Promise<{ deals: Deal[]; asOnDate: string; fetchedAt: string }> {
  const cookie = await getNseSession();
  const { bulk, asOnDate } = await fetchSnapshot(cookie);
  return { deals: bulk, asOnDate, fetchedAt: new Date().toISOString() };
}

export async function fetchShortDeals(): Promise<{ deals: Deal[]; asOnDate: string; fetchedAt: string }> {
  const cookie = await getNseSession();
  const { short, asOnDate } = await fetchSnapshot(cookie);
  return { deals: short, asOnDate, fetchedAt: new Date().toISOString() };
}

export async function fetchBlockDeals(date?: string): Promise<{ deals: Deal[]; fetchedAt: string }> {
  const today = new Date().toISOString().split("T")[0];
  const targetDate = date ?? today;
  const cookie = await getNseSession();

  if (targetDate === today) {
    const { block } = await fetchSnapshot(cookie);
    return { deals: block, fetchedAt: new Date().toISOString() };
  }

  // Historical -- may return empty if NSE doesn't expose it
  const deals = await fetchHistoricalBlockDeals(cookie, targetDate);
  return { deals, fetchedAt: new Date().toISOString() };
}

// Legacy combined fetch
export async function fetchDeals(date?: string): Promise<{ deals: Deal[]; fetchedAt: string }> {
  const cookie = await getNseSession();
  const { bulk, block } = await fetchSnapshot(cookie);
  return { deals: [...bulk, ...block].sort((a, b) => b.valueCr - a.valueCr), fetchedAt: new Date().toISOString() };
}

// Keep ShortSell export for any existing imports (unused internally)
export interface ShortSell {
  id: string; symbol: string; companyName: string;
  totalShortSell: number; totalBuyBack: number; netShort: number;
}
export async function fetchShortSelling(): Promise<{ data: ShortSell[]; fetchedAt: string }> {
  return { data: [], fetchedAt: new Date().toISOString() };
}
