// lib/nse-derivatives.ts

const NSE_BASE = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const JSON_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/option-chain",
  "X-Requested-With": "XMLHttpRequest",
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export interface OptionRow {
  strikePrice: number;
  expiryDate: string;
  // Calls
  ceOI: number | null; ceOIChg: number | null; ceVol: number | null;
  ceIV: number | null; ceLTP: number | null; ceAsk: number | null; ceBid: number | null;
  ceDelta: number | null; ceGamma: number | null; ceTheta: number | null;
  ceVega: number | null; ceRho: number | null;
  // Puts
  peOI: number | null; peOIChg: number | null; peVol: number | null;
  peIV: number | null; peLTP: number | null; peAsk: number | null; peBid: number | null;
  peDelta: number | null; peGamma: number | null; peTheta: number | null;
  peVega: number | null; peRho: number | null;
}

export interface DerivativesData {
  symbol: string; expiry: string; expiryDates: string[];
  spot: number; timestamp: string; pcr: number; maxPain: number;
  atmStrike: number; atmIV: number; chain: OptionRow[];
  fetchedAt: string;
}

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const arr: string[] = h.getSetCookie
    ? h.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
  return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function getNseSession(): Promise<string> {
  const warmupRes = await fetch(`${NSE_BASE}/option-chain`, {
    headers: { ...HTML_HEADERS, "Sec-Fetch-Site": "none" },
  });
  return extractCookies(warmupRes);
}

function computeMaxPain(chain: OptionRow[]): number {
  const strikes = chain.map((r) => r.strikePrice);
  let minLoss = Infinity;
  let maxPainStrike = strikes[Math.floor(strikes.length / 2)] ?? 0;
  for (const testStrike of strikes) {
    let totalLoss = 0;
    for (const row of chain) {
      if (row.ceOI != null && testStrike > row.strikePrice)
        totalLoss += (testStrike - row.strikePrice) * row.ceOI;
      if (row.peOI != null && testStrike < row.strikePrice)
        totalLoss += (row.strikePrice - testStrike) * row.peOI;
    }
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = testStrike; }
  }
  return maxPainStrike;
}

function findAtmStrike(chain: OptionRow[], spot: number): number {
  return chain.reduce((best, row) =>
    Math.abs(row.strikePrice - spot) < Math.abs(best.strikePrice - spot) ? row : best
  ).strikePrice;
}

const cache = new Map<string, { data: DerivativesData; ts: number }>();
const CACHE_TTL = 30 * 1000;

const INDICES = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"]);

export async function fetchDerivatives(symbol: string, expiry?: string): Promise<DerivativesData> {
  const sym = symbol.toUpperCase();

  // Fast path: if explicit expiry given, check cache first
  if (expiry) {
    const cached = cache.get(`${sym}:${expiry}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  }

  const cookie = await getNseSession();

  const infoRes = await fetch(
    `${NSE_BASE}/api/option-chain-contract-info?symbol=${sym}`,
    { headers: { ...JSON_HEADERS, Cookie: cookie } }
  );
  if (!infoRes.ok) throw new Error(`NSE contract-info ${infoRes.status}`);
  const info = await infoRes.json();
  const expiryDates: string[] = info.expiryDates ?? [];
  if (expiryDates.length === 0) throw new Error("NSE_SESSION_REQUIRED");
  const selectedExpiry = expiry ?? expiryDates[0];

  // Always use resolved expiry as cache key
  const cacheKey = `${sym}:${selectedExpiry}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const chainType = INDICES.has(sym) ? "Indices" : "Equity";
  const url = `${NSE_BASE}/api/option-chain-v3?type=${chainType}&symbol=${sym}&expiry=${encodeURIComponent(selectedExpiry)}`;
  const res = await fetch(url, { headers: { ...JSON_HEADERS, Cookie: cookie } });
  if (!res.ok) throw new Error(`NSE option-chain-v3 ${res.status}`);
  const json = await res.json();
  if (!json.records) throw new Error("NSE_SESSION_REQUIRED");

  const spot: number = json.records?.underlyingValue ?? 0;
  const timestamp: string = json.records?.timestamp ?? "";
  const rawData: Record<string, unknown>[] = json.records?.data ?? [];

  const chain: OptionRow[] = rawData
    .map((d) => {
      const ce = d.CE as Record<string, number> | undefined;
      const pe = d.PE as Record<string, number> | undefined;
      return {
        strikePrice: Number(d.strikePrice),
        expiryDate: selectedExpiry,
        ceOI: ce?.openInterest ?? null, ceOIChg: ce?.changeinOpenInterest ?? null,
        ceVol: ce?.totalTradedVolume ?? null, ceIV: ce?.impliedVolatility ?? null,
        ceLTP: ce?.lastPrice ?? null, ceAsk: ce?.askPrice ?? null, ceBid: ce?.bidPrice ?? null,
        ceDelta: ce?.delta ?? null, ceGamma: ce?.gamma ?? null, ceTheta: ce?.theta ?? null,
        ceVega: ce?.vega ?? null, ceRho: ce?.rho ?? null,
        peOI: pe?.openInterest ?? null, peOIChg: pe?.changeinOpenInterest ?? null,
        peVol: pe?.totalTradedVolume ?? null, peIV: pe?.impliedVolatility ?? null,
        peLTP: pe?.lastPrice ?? null, peAsk: pe?.askPrice ?? null, peBid: pe?.bidPrice ?? null,
        peDelta: pe?.delta ?? null, peGamma: pe?.gamma ?? null, peTheta: pe?.theta ?? null,
        peVega: pe?.vega ?? null, peRho: pe?.rho ?? null,
      };
    })
    .sort((a, b) => a.strikePrice - b.strikePrice);

  const filtered = json.filtered ?? {};
  const totCeOI: number = filtered.CE?.totOI ?? 0;
  const totPeOI: number = filtered.PE?.totOI ?? 0;
  const pcr = totCeOI > 0 ? totPeOI / totCeOI : 0;
  const maxPain = computeMaxPain(chain);
  const atmStrike = chain.length > 0 ? findAtmStrike(chain, spot) : 0;
  const atmRow = chain.find((r) => r.strikePrice === atmStrike);
  const atmIV = atmRow?.ceIV ?? atmRow?.peIV ?? 0;

  const data: DerivativesData = {
    symbol: sym, expiry: selectedExpiry, expiryDates, spot, timestamp,
    pcr, maxPain, atmStrike, atmIV, chain, fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export async function fetchExpiries(symbol: string): Promise<string[]> {
  const sym = symbol.toUpperCase();
  try {
    const cookie = await getNseSession();
    const res = await fetch(
      `${NSE_BASE}/api/option-chain-contract-info?symbol=${sym}`,
      { headers: { ...JSON_HEADERS, Cookie: cookie } }
    );
    if (!res.ok) return [];
    const info = await res.json();
    return info.expiryDates ?? [];
  } catch {
    return [];
  }
}
