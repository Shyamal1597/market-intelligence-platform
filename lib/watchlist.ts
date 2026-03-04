// lib/watchlist.ts
import { promises as fs } from "fs";
import path from "path";

const WATCHLIST_PATH = path.join(process.cwd(), "data", "watchlist.json");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NSE_BASE_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  symbol: string;
  bseCode: string;
  name: string;
  sector: string;
  yahooTicker: string;
  marketCapBucket: "largecap" | "midcap" | "smallcap";
  analyst: string;
  rating: string;
  targetPrice: number | null;
  addedAt: string;
}

// ── NSE Session (minimal — warm up homepage only) ─────────────────────────────

async function getNseSession(): Promise<string> {
  try {
    const res = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const arr = h.getSetCookie
      ? h.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
    return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

// ── NSE Nifty50 Seed ─────────────────────────────────────────────────────────

interface NseIndexItem {
  symbol: string;
  meta?: { companyName?: string; industry?: string };
  [key: string]: unknown;
}

async function seedFromNse(): Promise<WatchlistEntry[]> {
  try {
    const cookie = await getNseSession();
    const res = await fetch(
      "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050",
      {
        headers: {
          ...NSE_BASE_HEADERS,
          Cookie: cookie,
          Referer: "https://www.nseindia.com/",
        },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    // First element is the index itself — skip it
    const items: NseIndexItem[] = (json.data ?? []).slice(1);
    const today = new Date().toISOString().slice(0, 10);
    return items.map((item) => ({
      symbol: item.symbol,
      bseCode: "",
      name: item.meta?.companyName ?? item.symbol,
      sector: item.meta?.industry ?? "",
      yahooTicker: `${item.symbol}.NS`,
      marketCapBucket: "largecap" as const,
      analyst: "",
      rating: "",
      targetPrice: null,
      addedAt: today,
    }));
  } catch (e) {
    console.error("[watchlist] NSE seed failed:", e);
    return [];
  }
}

// ── NSE Symbol Validation ─────────────────────────────────────────────────────

/** Returns true if symbol exists on NSE. Fails open (returns true) if NSE unreachable. */
export async function validateNseSymbol(symbol: string): Promise<boolean> {
  try {
    const cookie = await getNseSession();
    const res = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
      {
        headers: {
          ...NSE_BASE_HEADERS,
          Cookie: cookie,
          Referer: "https://www.nseindia.com/",
        },
      }
    );
    if (res.status === 404) return false;
    if (!res.ok) return true; // fail open — NSE may be blocked
    const json = await res.json();
    return !!(json?.info?.symbol || json?.priceInfo);
  } catch {
    return true; // fail open
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function loadWatchlist(): Promise<WatchlistEntry[]> {
  try {
    const raw = await fs.readFile(WATCHLIST_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchlistEntry[]) : [];
  } catch {
    // File missing — seed from NSE Nifty50
    const seeded = await seedFromNse();
    if (seeded.length > 0) {
      await saveWatchlist(seeded);
    }
    return seeded;
  }
}

export async function saveWatchlist(entries: WatchlistEntry[]): Promise<void> {
  await fs.writeFile(WATCHLIST_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function resetWatchlist(): Promise<WatchlistEntry[]> {
  try {
    await fs.unlink(WATCHLIST_PATH);
  } catch {
    /* file may not exist */
  }
  return loadWatchlist(); // triggers re-seed
}

export async function addToWatchlist(entry: WatchlistEntry): Promise<void> {
  const list = await loadWatchlist();
  if (list.some((e) => e.symbol === entry.symbol)) {
    throw new Error(`${entry.symbol} already in watchlist`);
  }
  list.push(entry);
  await saveWatchlist(list);
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const list = await loadWatchlist();
  await saveWatchlist(list.filter((e) => e.symbol !== symbol));
}

export async function patchWatchlistEntry(
  symbol: string,
  patch: Partial<Pick<WatchlistEntry, "analyst" | "rating" | "targetPrice" | "bseCode" | "marketCapBucket" | "name" | "sector">>
): Promise<WatchlistEntry | null> {
  const list = await loadWatchlist();
  const idx = list.findIndex((e) => e.symbol === symbol);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  await saveWatchlist(list);
  return list[idx];
}
