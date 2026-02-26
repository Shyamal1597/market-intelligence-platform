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
  "INR=X": "USD/INR",
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

export async function fetchAllQuotes(): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    Object.keys(SYMBOLS).map(fetchQuote)
  );

  return results
    .filter((r): r is PromiseFulfilledResult<QuoteData> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}
