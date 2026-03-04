import { NextRequest, NextResponse } from "next/server";
import { fetchEarnings, forceRefreshEarnings } from "@/lib/earnings";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const data = force
      ? await forceRefreshEarnings(symbol.toUpperCase())
      : await fetchEarnings(symbol.toUpperCase());
    if (!data) {
      return NextResponse.json(
        { error: `No earnings data for ${symbol}` },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
