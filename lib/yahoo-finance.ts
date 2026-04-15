// lib/yahoo-finance.ts
export interface QuoteData {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  history: number[];
}

const SYMBOLS: Record<string, string> = {
  "^NSEI": "Nifty 50",
  "^BSESN": "Sensex",
  "^NSEBANK": "Bank Nifty",
  "BZ=F": "Brent Crude",
  "GC=F": "Gold",
  "SI=F": "Silver",
  "INR=X": "USD/INR",
};

// ── Global market index symbols ───────────────────────────────────────────────
export const GLOBAL_SYMBOLS: Record<string, { label: string; region: string }> = {
  // Others
  "^TNX":       { label: "US 10yr",         region: "Others" },
  "^INBY10":    { label: "GIND 10YR",       region: "Others" },
  "DX-Y.NYB":   { label: "$ Index",         region: "Others" },
  "^VIX":       { label: "US VIX",          region: "Others" },
  "^BDI":       { label: "Baltic Dry",      region: "Others" },
  "CL=F":       { label: "Nymex (USD/bbl)", region: "Others" },
  "BZ=F":       { label: "Brent (USD/bbl)", region: "Others" },
  // US
  "^DJI":       { label: "DJIA",            region: "US" },
  "^IXIC":      { label: "NASDAQ COMP",     region: "US" },
  "^GSPC":      { label: "S&P 500",         region: "US" },
  // Latin America
  "^BVSP":      { label: "BOVESPA",         region: "Latin America" },
  "^MXX":       { label: "BOLSA",           region: "Latin America" },
  // Europe
  "^FTSE":      { label: "FTSE",            region: "Europe" },
  "^FCHI":      { label: "CAC",             region: "Europe" },
  "^GDAXI":     { label: "DAX",             region: "Europe" },
  // Asia Pacific
  "^AXJO":      { label: "AUSTRALIA",       region: "Asia Pacific" },
  "^HSI":       { label: "HANGSENG",        region: "Asia Pacific" },
  "^JKSE":      { label: "JAKARTA",         region: "Asia Pacific" },
  "^KLSE":      { label: "MALAYSIA/KLSE",   region: "Asia Pacific" },
  "^N225":      { label: "NIKKEI",          region: "Asia Pacific" },
  "^KS11":      { label: "SEOUL",           region: "Asia Pacific" },
  "000001.SS":  { label: "SHANGHAI",        region: "Asia Pacific" },
  "^STI":       { label: "STRAITS",         region: "Asia Pacific" },
  "^TWII":      { label: "TAIWAN",          region: "Asia Pacific" },
  "^SET.BK":    { label: "THAILAND",        region: "Asia Pacific" },
  // India
  "^NSEI":      { label: "NIFTY",           region: "India" },
  "^BSESN":     { label: "SENSEX",          region: "India" },
};

export const REGION_ORDER = ["Others", "US", "Latin America", "Europe", "Asia Pacific", "India"];

export async function fetchGlobalQuotes(): Promise<(QuoteData & { region: string })[]> {
  const results = await Promise.allSettled(
    Object.keys(GLOBAL_SYMBOLS).map(fetchQuote)
  );
  return results
    .filter((r): r is PromiseFulfilledResult<QuoteData | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is QuoteData => v !== null)
    .map((q) => ({
      ...q,
      label: GLOBAL_SYMBOLS[q.symbol]?.label ?? q.label,
      region: GLOBAL_SYMBOLS[q.symbol]?.region ?? "Other",
    }));
}

const SECTOR_SYMBOLS: Record<string, string> = {
  "^CNXAUTO":    "Nifty Auto",
  "^CNXIT":      "Nifty IT",
  "^CNXFMCG":    "Nifty FMCG",
  "^NSEBANK":    "Nifty Bank",
  "^CNXMETAL":   "Nifty Metal",
  "^CNXPHARMA":  "Nifty Pharma",
  "^CNXREALTY":  "Nifty Realty",
  "^CNXENERGY":  "Nifty Energy",
  "^CNXINFRA":   "Nifty Infra",
  "^CNXPSUBANK": "Nifty PSU Bank",
};

export async function fetchQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const encodedSymbol = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=5m&range=1d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((v: number | null) => v !== null).slice(-20);

    const price = meta.regularMarketPrice ?? meta.previousClose;
    const previousClose = meta.previousClose ?? price;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol,
      label: SYMBOLS[symbol] ?? symbol,
      price,
      change,
      changePercent,
      previousClose,
      history: validCloses,
    };
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return null;
  }
}

// Troy ounce conversion factors
const TROY_OZ_PER_10G = 10 / 31.1035;
const TROY_OZ_PER_KG  = 1000 / 31.1035;

export async function fetchAllQuotes(): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    Object.keys(SYMBOLS).map(fetchQuote)
  );

  const quotes = results
    .filter((r): r is PromiseFulfilledResult<QuoteData | null> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((v): v is QuoteData => v !== null);

  // Find gold, silver (USD/oz) and INR rate for conversion
  const gold    = quotes.find((q) => q.symbol === "GC=F");
  const silver  = quotes.find((q) => q.symbol === "SI=F");
  const inrRate = quotes.find((q) => q.symbol === "INR=X");

  const derived: QuoteData[] = [];

  if (gold && inrRate) {
    const convertPrice = (usdOz: number) => usdOz * inrRate.price * TROY_OZ_PER_10G;
    const goldInrPrice = convertPrice(gold.price);
    const goldInrPrev  = convertPrice(gold.previousClose);
    const goldInrChange = goldInrPrice - goldInrPrev;
    derived.push({
      symbol: "GOLD_INR",
      label: "Gold ₹/10g",
      price: goldInrPrice,
      change: goldInrChange,
      changePercent: (goldInrChange / goldInrPrev) * 100,
      previousClose: goldInrPrev,
      history: (gold.history ?? []).map((h) => h * inrRate.price * TROY_OZ_PER_10G),
    });
  }

  if (silver && inrRate) {
    const convertPrice = (usdOz: number) => usdOz * inrRate.price * TROY_OZ_PER_KG;
    const silverInrPrice = convertPrice(silver.price);
    const silverInrPrev  = convertPrice(silver.previousClose);
    const silverInrChange = silverInrPrice - silverInrPrev;
    derived.push({
      symbol: "SILVER_INR",
      label: "Silver ₹/kg",
      price: silverInrPrice,
      change: silverInrChange,
      changePercent: (silverInrChange / silverInrPrev) * 100,
      previousClose: silverInrPrev,
      history: (silver.history ?? []).map((h) => h * inrRate.price * TROY_OZ_PER_KG),
    });
  }

  return [...quotes, ...derived];
}

export async function fetchSectorQuotes(): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    Object.keys(SECTOR_SYMBOLS).map(fetchQuote)
  );

  const quotes = results
    .filter((r): r is PromiseFulfilledResult<QuoteData | null> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((v): v is QuoteData => v !== null)
    .map((q) => ({ ...q, label: SECTOR_SYMBOLS[q.symbol] ?? q.symbol }));

  return quotes;
}
