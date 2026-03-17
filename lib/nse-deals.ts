// lib/nse-deals.ts

const NSE_BASE = "https://www.nseindia.com";

const HTML_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const JSON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/market-data/block-deal",
  "X-Requested-With": "XMLHttpRequest",
};

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const arr: string[] = h.getSetCookie
    ? h.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
  return arr
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function getNseSession(): Promise<string> {
  try {
    const homeRes = await fetch(NSE_BASE, { headers: HTML_HEADERS });
    const cookie = extractCookies(homeRes);
    // warm-up: block-deal page
    await fetch(`${NSE_BASE}/market-data/block-deal`, {
      headers: { ...HTML_HEADERS, Cookie: cookie, Referer: `${NSE_BASE}/` },
    });
    return cookie;
  } catch (err) {
    console.error("[nse-deals] session warm-up failed:", err);
    throw new Error(`[nse-deals] Failed to establish NSE session: ${err}`);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type DealType = "BULK" | "BLOCK";
export type DealSide = "BUY" | "SELL" | "UNKNOWN";

export interface Deal {
  id: string;           // synthetic: index-based
  exchange: "NSE" | "BSE";
  type: DealType;
  date: string;         // as returned by NSE
  symbol: string;
  companyName: string;
  client: string;
  side: DealSide;
  quantity: number;
  price: number;
  valueCr: number;      // computed: quantity * price / 10_000_000
}

// ── NSE Bulk Deals ─────────────────────────────────────────────────────────────

async function fetchNseBulkDeals(cookie: string, date?: string): Promise<Deal[]> {
  let url = `${NSE_BASE}/api/bulk-deal`;
  if (date) url += `?date=${date}`;
  try {
    const res = await fetch(url, { headers: { ...JSON_HEADERS, Cookie: cookie } });
    if (!res.ok) return [];
    const json = await res.json();
    const data: Record<string, unknown>[] = Array.isArray(json) ? json : (json.data ?? []);

    return data.map((d, i) => {
      const qty = Number(d.quantity ?? d.BD_QTY_TRD ?? 0);
      const price = Number(d.price ?? d.BD_TP_WATP ?? 0);
      const sideRaw = String(d.dealType ?? d.BD_BUY_SELL ?? "").toUpperCase();
      return {
        id: `NSE-BULK-${i}`,
        exchange: "NSE" as const,
        type: "BULK" as const,
        date: String(d.date ?? d.BD_DT_DATE ?? ""),
        symbol: String(d.symbol ?? d.BD_SYMBOL ?? ""),
        companyName: String(d.security ?? d.BD_SCRIP_NAME ?? ""),
        client: String(d.clientName ?? d.BD_CLIENT_NAME ?? ""),
        side: sideRaw.startsWith("B") ? "BUY" : sideRaw.startsWith("S") ? "SELL" : "UNKNOWN",
        quantity: qty,
        price,
        valueCr: (qty * price) / 10_000_000,
      };
    });
  } catch {
    return [];
  }
}

// ── NSE Block Deals ────────────────────────────────────────────────────────────

async function fetchNseBlockDeals(cookie: string, date?: string): Promise<Deal[]> {
  let url = `${NSE_BASE}/api/block-deal`;
  if (date) url += `?date=${date}`;
  try {
    const res = await fetch(url, { headers: { ...JSON_HEADERS, Cookie: cookie } });
    if (!res.ok) return [];
    const json = await res.json();
    const data: Record<string, unknown>[] = Array.isArray(json) ? json : (json.data ?? []);

    return data.map((d, i) => {
      const qty = Number(d.quantity ?? d.BD_QTY_TRD ?? 0);
      const price = Number(d.price ?? d.BD_TP_WATP ?? 0);
      const sideRaw = String(d.dealType ?? d.BD_BUY_SELL ?? "").toUpperCase();
      return {
        id: `NSE-BLOCK-${i}`,
        exchange: "NSE" as const,
        type: "BLOCK" as const,
        date: String(d.date ?? d.BD_DT_DATE ?? ""),
        symbol: String(d.symbol ?? d.BD_SYMBOL ?? ""),
        companyName: String(d.security ?? d.BD_SCRIP_NAME ?? ""),
        client: String(d.clientName ?? d.BD_CLIENT_NAME ?? ""),
        side: sideRaw.startsWith("B") ? "BUY" : sideRaw.startsWith("S") ? "SELL" : "UNKNOWN",
        quantity: qty,
        price,
        valueCr: (qty * price) / 10_000_000,
      };
    });
  } catch {
    return [];
  }
}

// ── Main Fetch ─────────────────────────────────────────────────────────────────

export async function fetchDeals(date?: string): Promise<{
  deals: Deal[];
  fetchedAt: string;
}> {
  const cookie = await getNseSession();
  const [bulk, block] = await Promise.allSettled([
    fetchNseBulkDeals(cookie, date),
    fetchNseBlockDeals(cookie, date),
  ]);

  const all: Deal[] = [
    ...(bulk.status === "fulfilled" ? bulk.value : []),
    ...(block.status === "fulfilled" ? block.value : []),
  ].sort((a, b) => b.valueCr - a.valueCr); // biggest value first

  return { deals: all, fetchedAt: new Date().toISOString() };
}
