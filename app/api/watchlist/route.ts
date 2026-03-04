import { NextRequest, NextResponse } from "next/server";
import {
  loadWatchlist,
  addToWatchlist,
  resetWatchlist,
  validateNseSymbol,
  WatchlistEntry,
} from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await loadWatchlist();
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Reset mode
    if (body.reset === true) {
      const fresh = await resetWatchlist();
      return NextResponse.json(fresh);
    }

    if (!body.symbol || typeof body.symbol !== "string") {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const symbol = body.symbol.toUpperCase().trim();

    // Validate against NSE (fail-open)
    const valid = await validateNseSymbol(symbol);
    if (!valid) {
      return NextResponse.json(
        { error: `${symbol} not found on NSE` },
        { status: 422 }
      );
    }

    const entry: WatchlistEntry = {
      symbol,
      bseCode: typeof body.bseCode === "string" ? body.bseCode : "",
      name: typeof body.name === "string" ? body.name : symbol,
      sector: typeof body.sector === "string" ? body.sector : "",
      yahooTicker: typeof body.yahooTicker === "string" ? body.yahooTicker : `${symbol}.NS`,
      marketCapBucket:
        body.marketCapBucket === "midcap" || body.marketCapBucket === "smallcap"
          ? body.marketCapBucket
          : "largecap",
      analyst: typeof body.analyst === "string" ? body.analyst : "",
      rating: typeof body.rating === "string" ? body.rating : "",
      targetPrice: typeof body.targetPrice === "number" ? body.targetPrice : null,
      addedAt: new Date().toISOString().slice(0, 10),
    };

    await addToWatchlist(entry);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
