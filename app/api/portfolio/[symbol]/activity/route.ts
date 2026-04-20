// app/api/portfolio/[symbol]/activity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSearchTerms } from "@/lib/smart-money";
import { fetchNSEFilings } from "@/lib/nse-filings";
import { fetchBulkDeals, fetchBlockDeals, fetchShortDeals } from "@/lib/nse-deals";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const NEWS_PATH = path.join(process.cwd(), "data", "market-news.json");

function getPortfolioNews(symbol: string, limit = 15) {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as {
      news: { title: string; source?: string; pubDate: string; link?: string }[];
    };
    const terms = getSearchTerms(symbol.toUpperCase());
    const matches = data.news.filter((n) => {
      const title = (n.title ?? "").toUpperCase();
      return terms.some((t) => title.includes(t));
    });
    return matches.slice(0, limit).map((n) => ({
      title: n.title,
      source: n.source ?? "Unknown",
      pubDate: n.pubDate,
      link: n.link ?? null,
    }));
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().trim();

  const [filingsResult, bulkResult, blockResult, shortResult] =
    await Promise.allSettled([
      fetchNSEFilings(500),
      fetchBulkDeals(),
      fetchBlockDeals(),
      fetchShortDeals(),
    ]);

  const newsItems = getPortfolioNews(sym, 15);

  const filings =
    filingsResult.status === "fulfilled"
      ? filingsResult.value
          .filter((f) => f.scripCode === sym)
          .slice(0, 20)
          .map((f) => ({
            id: f.id,
            company: f.company,
            filingType: f.filingType,
            description: f.description,
            pdfUrl: f.pdfUrl,
            submittedAt: f.submittedAt,
          }))
      : [];

  const bulkDeals =
    bulkResult.status === "fulfilled"
      ? bulkResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const blockDeals =
    blockResult.status === "fulfilled"
      ? blockResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const shortDeals =
    shortResult.status === "fulfilled"
      ? shortResult.value.deals.filter((d) => d.symbol === sym)
      : [];

  const allDeals = [...bulkDeals, ...blockDeals, ...shortDeals]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map((d) => ({
      id: d.id,
      type: d.type,
      date: d.date,
      client: d.client,
      side: d.side,
      quantity: d.quantity,
      price: d.price,
      valueCr: d.valueCr,
    }));

  const now = new Date().toISOString();

  return NextResponse.json({
    symbol: sym,
    news: { items: newsItems, fetchedAt: now },
    filings: { items: filings, fetchedAt: now },
    deals: { items: allDeals, fetchedAt: now },
  });
}
