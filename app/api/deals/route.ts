// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchDeals, fetchBlockDeals, fetchBulkDeals, fetchShortDeals } from "@/lib/nse-deals";
import type { Deal } from "@/lib/nse-deals";

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetch the latest market price for a single NSE symbol via Yahoo Finance v8 chart API.
 * This endpoint works without a crumb/cookie -- confirmed by the existing /api/quote route.
 */
async function fetchPriceV8(symbol: string): Promise<number> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1d`,
      {
        headers: { "User-Agent": UA },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    return (meta?.regularMarketPrice ?? meta?.previousClose ?? 0) as number;
  } catch {
    return 0;
  }
}

/**
 * Batch-fetch latest prices for a list of NSE symbols.
 * Runs up to CONCURRENCY requests in parallel; collects results into a symbol→price map.
 */
async function fetchYahooPrices(symbols: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  if (symbols.length === 0) return priceMap;

  const CONCURRENCY = 15;

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((s) => fetchPriceV8(s)));
    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      const price = r.status === "fulfilled" ? r.value : 0;
      if (price > 0) priceMap.set(chunk[j], price);
    }
  }

  return priceMap;
}

function enrichWithPrices(deals: Deal[], priceMap: Map<string, number>): Deal[] {
  return deals.map((d) => {
    const price = priceMap.get(d.symbol) ?? d.price;
    const valueCr =
      price > 0 && d.quantity > 0 ? (d.quantity * price) / 10_000_000 : d.valueCr;
    return { ...d, price, valueCr };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tab = searchParams.get("tab");
  const date = searchParams.get("date") ?? undefined;

  try {
    if (tab === "short") {
      const data = await fetchShortDeals();
      // Enrich with live close prices -- NSE short data carries no price
      const symbols = [...new Set(data.deals.map((d) => d.symbol).filter(Boolean))];
      const priceMap = await fetchYahooPrices(symbols);
      const enriched = enrichWithPrices(data.deals, priceMap);
      return NextResponse.json({ ...data, deals: enriched });
    }

    if (tab === "bulk") {
      const data = await fetchBulkDeals();
      return NextResponse.json(data);
    }

    if (tab === "block") {
      const data = await fetchBlockDeals(date);
      return NextResponse.json(data);
    }

    if (tab !== null) {
      return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
    }

    // Legacy: no tab param → combined block + bulk
    const data = await fetchDeals(date);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Deals API error:", error);
    return NextResponse.json(
      { deals: [], fetchedAt: new Date().toISOString(), error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}
