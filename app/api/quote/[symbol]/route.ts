import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = symbol.includes(".") ? symbol : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) {
      return NextResponse.json({ error: "No data" }, { status: 404 });
    }
    const price: number = meta.regularMarketPrice ?? meta.previousClose;
    const prev: number = meta.previousClose ?? price;
    const change = price - prev;
    return NextResponse.json({
      symbol: ticker,
      price,
      change,
      changePercent: prev !== 0 ? (change / prev) * 100 : 0,
      previousClose: prev,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
