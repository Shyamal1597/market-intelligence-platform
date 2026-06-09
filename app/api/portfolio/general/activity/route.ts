// app/api/portfolio/general/activity/route.ts
import { NextResponse } from "next/server";
import { fetchNSEFilings } from "@/lib/nse-filings";
import { fetchAllDeals } from "@/lib/nse-deals";
import type { Deal } from "@/lib/nse-deals";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const NEWS_PATH = path.join(process.cwd(), "data", "market-news.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getLatestNews(limit = 20) {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as {
      news: { title: string; source?: string; pubDate: string; link?: string }[];
    };
    return data.news.slice(0, limit).map((n) => ({
      title: n.title,
      source: n.source ?? "Unknown",
      pubDate: n.pubDate,
      link: n.link ?? null,
    }));
  } catch {
    return [];
  }
}

/** Fetch a single NSE symbol's latest price via Yahoo Finance v8 chart (no crumb needed). */
async function fetchPriceV8(symbol: string): Promise<number> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1d`,
      { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    return (meta?.regularMarketPrice ?? meta?.previousClose ?? 0) as number;
  } catch {
    return 0;
  }
}

/** Enrich short deals with live close prices -- NSE snapshot carries no price for short positions. */
async function enrichShortWithPrices(deals: Deal[]): Promise<Deal[]> {
  if (deals.length === 0) return deals;
  const symbols = [...new Set(deals.map((d) => d.symbol).filter(Boolean))];
  const CONCURRENCY = 15;
  const priceMap = new Map<string, number>();

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((s) => fetchPriceV8(s)));
    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      const price = r.status === "fulfilled" ? r.value : 0;
      if (price > 0) priceMap.set(chunk[j], price);
    }
  }

  return deals.map((d) => {
    const price = priceMap.get(d.symbol) ?? d.price;
    const valueCr =
      price > 0 && d.quantity > 0 ? (d.quantity * price) / 10_000_000 : d.valueCr;
    return { ...d, price, valueCr };
  });
}

function mapDeal(d: Deal) {
  return {
    id: d.id,
    type: d.type,
    date: d.date,
    symbol: d.symbol,
    client: d.client,
    side: d.side,
    quantity: d.quantity,
    price: d.price,
    valueCr: d.valueCr,
  };
}

export async function GET() {
  // Fetch filings and all deal types in parallel (deals use one NSE session via fetchAllDeals)
  const [filingsResult, dealsResult] = await Promise.allSettled([
    fetchNSEFilings(2000),
    fetchAllDeals(),
  ]);

  const newsItems = getLatestNews(20);

  const filings =
    filingsResult.status === "fulfilled"
      ? filingsResult.value.slice(0, 25).map((f) => ({
          id: f.id,
          company: f.company,
          filingType: f.filingType,
          description: f.description,
          pdfUrl: f.pdfUrl,
          submittedAt: f.submittedAt,
        }))
      : [];

  const { bulk = [], block = [], short = [] } =
    dealsResult.status === "fulfilled" ? dealsResult.value : {};

  // Enrich short deals with live prices, same as /api/deals?tab=short
  const enrichedShort = await enrichShortWithPrices(short);

  const now = new Date().toISOString();

  return NextResponse.json({
    symbol: null,
    news: { items: newsItems, fetchedAt: now },
    filings: { items: filings, fetchedAt: now },
    // Return typed arrays -- panel renders each tab directly from its own array,
    // avoiding the merge-then-slice problem that was cutting off short/block data.
    deals: {
      bulk: bulk.map(mapDeal),
      block: block.map(mapDeal),
      short: enrichedShort.map(mapDeal),
      fetchedAt: now,
    },
  });
}
