/**
 * GET /api/breeze/historical/[symbol]?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns daily close prices for [symbol] between from..to.
 * Requires an active Breeze session (POST /api/breeze/callback first).
 * Results are file-cached: historical dates cache forever, today refreshes after 4h.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBreezeSession, getHistoricalData } from "@/lib/breeze";

export const dynamic = "force-dynamic";

export interface HistoricalResponse {
  symbol: string;
  candles: Array<{ date: string; close: number }>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const from = req.nextUrl.searchParams.get("from");
  const to =
    req.nextUrl.searchParams.get("to") ??
    new Date().toISOString().split("T")[0];

  if (!from) {
    return NextResponse.json({ error: "Missing ?from=YYYY-MM-DD" }, { status: 400 });
  }

  const sessionToken = getBreezeSession();
  if (!sessionToken) {
    return NextResponse.json({ error: "Breeze session not active. Please authenticate." }, { status: 401 });
  }

  const result = await getHistoricalData(symbol.toUpperCase(), from, to, sessionToken);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ symbol: symbol.toUpperCase(), candles: result } satisfies HistoricalResponse);
}
