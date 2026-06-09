import { NextRequest, NextResponse } from "next/server";
import { fetchNSEFilings } from "@/lib/nse-filings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Clamp limit to [1, 100] -- reject NaN and out-of-range values
    const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);
    const symbol = searchParams.get("symbol")?.toUpperCase() ?? null;

    // Fetch more items upfront when filtering by symbol so we have enough after filter
    const fetchLimit = symbol ? Math.min(limit * 10, 1000) : limit;
    let filings = await fetchNSEFilings(fetchLimit);

    if (symbol) {
      filings = filings.filter((f) => f.scripCode === symbol).slice(0, limit);
    }

    return NextResponse.json({ filings, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Filings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch filings" },
      { status: 500 }
    );
  }
}
