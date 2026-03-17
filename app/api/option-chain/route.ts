import { NextRequest, NextResponse } from "next/server";
import { fetchDerivatives } from "@/lib/nse-derivatives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "NIFTY";
  const expiry = req.nextUrl.searchParams.get("expiry") ?? undefined;
  try {
    const data = await fetchDerivatives(symbol, expiry);
    return NextResponse.json(data);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("NSE_SESSION_REQUIRED")) {
      return NextResponse.json({ error: "NSE_SESSION_REQUIRED" }, { status: 503 });
    }
    console.error("[option-chain]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
