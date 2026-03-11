import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Maps common shorthand / legacy NSE codes used internally in report metadata
 * to their correct Yahoo Finance ticker roots (without the .NS suffix).
 *
 * Add entries here whenever an analyst enters a non-standard symbol in a report.
 */
const SYMBOL_ALIASES: Record<string, string> = {
  // Kirloskar Brothers — correct NSE ticker is KIRLOSBROS, not KBL
  KBL: "KIRLOSBROS",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    // Resolve any known alias first, then append .NS for plain NSE codes
    const resolved = SYMBOL_ALIASES[symbol.toUpperCase()] ?? symbol;
    const ticker = resolved.includes(".") ? resolved : `${resolved}.NS`;
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
