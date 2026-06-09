// lib/earnings.ts
import { promises as fs } from "fs";
import path from "path";

const EARNINGS_DIR = path.join(process.cwd(), "data", "earnings");
const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// -- Types --------------------------------------------------------------------

export interface EarningsQuarter {
  quarterLabel: string; // "Q3 FY26"
  endDate: string;      // "2025-12-31"
  totalRevenue: number; // ₹ crores
  ebit: number;         // ₹ crores
  netIncome: number;    // PAT, ₹ crores
  basicEps: number | null; // ₹ per share
}

export interface EarningsData {
  symbol: string;
  quarters: EarningsQuarter[]; // oldest → newest
  fetchedAt: string;
}

// -- Quarter Label -------------------------------------------------------------

/** "2025-12-31" → "Q3 FY26" (Indian fiscal year: Apr-Mar) */
function toFYLabel(endDate: string): string {
  const d = new Date(endDate);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  let quarter: string;
  let fy: number;
  if (month >= 4 && month <= 6)    { quarter = "Q1"; fy = year + 1; }
  else if (month >= 7 && month <= 9)   { quarter = "Q2"; fy = year + 1; }
  else if (month >= 10 && month <= 12) { quarter = "Q3"; fy = year + 1; }
  else                              { quarter = "Q4"; fy = year; }
  return `${quarter} FY${String(fy).slice(2)}`;
}

// -- Cache ---------------------------------------------------------------------

async function loadCached(symbol: string): Promise<EarningsData | null> {
  try {
    const raw = await fs.readFile(
      path.join(EARNINGS_DIR, `${symbol}.json`),
      "utf-8"
    );
    const data = JSON.parse(raw) as EarningsData;
    if (Date.now() - new Date(data.fetchedAt).getTime() < STALE_MS) {
      return data;
    }
    return null; // stale
  } catch {
    return null;
  }
}

async function saveCache(data: EarningsData): Promise<void> {
  await fs.mkdir(EARNINGS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(EARNINGS_DIR, `${data.symbol}.json`),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

// -- Yahoo Crumb Auth ----------------------------------------------------------

interface YahooAuth {
  cookie: string;
  crumb: string;
}

let authCache: { value: YahooAuth; expiresAt: number } | null = null;
const AUTH_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function getYahooAuth(): Promise<YahooAuth | null> {
  if (authCache && Date.now() < authCache.expiresAt) {
    return authCache.value;
  }

  try {
    // Step 1: Hit fc.yahoo.com to obtain session cookies
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    const rawSetCookie = cookieRes.headers.get("set-cookie") ?? "";
    // Collapse multi-cookie header into a single Cookie: string
    const cookieStr = rawSetCookie
      .split(/,(?=[^;]+=[^;]+)/) // split on commas that start a new k=v pair
      .map((c) => c.split(";")[0].trim())
      .join("; ");
    if (!cookieStr) return null;

    // Step 2: Fetch crumb using those cookies
    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
        },
      }
    );
    const crumb = (await crumbRes.text()).trim();
    // Guard against receiving an HTML error page instead of the crumb
    if (!crumb || crumb.startsWith("<") || crumb.length > 20) return null;

    const value: YahooAuth = { cookie: cookieStr, crumb };
    authCache = { value, expiresAt: Date.now() + AUTH_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

// -- Yahoo Finance Fetch -------------------------------------------------------

interface YahooStatement {
  endDate?: { raw: number };
  totalRevenue?: { raw: number };
  ebit?: { raw: number };
  netIncome?: { raw: number };
  basicEps?: { raw: number };
}

export async function fetchEarnings(symbol: string): Promise<EarningsData | null> {
  const cached = await loadCached(symbol);
  if (cached) return cached;

  try {
    // Yahoo ticker: "RELIANCE" → "RELIANCE.NS"; already-qualified symbols pass through
    const yahooTicker = symbol.includes(".") ? symbol : `${symbol}.NS`;
    const auth = await getYahooAuth();
    const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooTicker)}?modules=incomeStatementHistoryQuarterly${crumbParam}`;
    const fetchHeaders: Record<string, string> = { "User-Agent": USER_AGENT };
    if (auth) fetchHeaders["Cookie"] = auth.cookie;
    const res = await fetch(url, {
      headers: fetchHeaders,
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`[earnings] Yahoo ${symbol} HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const statements: YahooStatement[] =
      json?.quoteSummary?.result?.[0]?.incomeStatementHistoryQuarterly
        ?.incomeStatementHistory ?? [];

    const quarters: EarningsQuarter[] = statements
      .map((s) => {
        const endDate = s.endDate?.raw
          ? new Date(s.endDate.raw * 1000).toISOString().slice(0, 10)
          : "";
        return {
          quarterLabel: endDate ? toFYLabel(endDate) : "Unknown",
          endDate,
          // Yahoo returns values in absolute rupees -- convert to crores
          totalRevenue: Math.round((s.totalRevenue?.raw ?? 0) / 1e7),
          ebit: Math.round((s.ebit?.raw ?? 0) / 1e7),
          netIncome: Math.round((s.netIncome?.raw ?? 0) / 1e7),
          basicEps: s.basicEps?.raw ?? null,
        };
      })
      .reverse(); // oldest → newest

    const data: EarningsData = {
      symbol,
      quarters,
      fetchedAt: new Date().toISOString(),
    };
    await saveCache(data);
    return data;
  } catch (e) {
    console.error(`[earnings] fetch failed for ${symbol}:`, e);
    return null;
  }
}

export async function forceRefreshEarnings(symbol: string): Promise<EarningsData | null> {
  try {
    await fs.unlink(path.join(EARNINGS_DIR, `${symbol}.json`));
  } catch {
    /* not cached */
  }
  return fetchEarnings(symbol);
}
