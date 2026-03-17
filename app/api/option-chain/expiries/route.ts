import { NextRequest, NextResponse } from "next/server";
import { fetchExpiries } from "@/lib/nse-derivatives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "NIFTY";
  try {
    const expiries = await fetchExpiries(symbol);
    return NextResponse.json({ symbol, expiries });
  } catch (err) {
    return NextResponse.json({ symbol, expiries: [], error: String(err) }, { status: 500 });
  }
}
