// app/api/deals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchDeals } from "@/lib/nse-deals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date") ?? undefined; // YYYY-MM-DD from client
  const raw = searchParams.get("raw") === "true";

  try {
    const data = await fetchDeals(date, raw);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Deals API error:", error);
    return NextResponse.json(
      { deals: [], fetchedAt: new Date().toISOString(), error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}
