import { NextRequest, NextResponse } from "next/server";
import { fetchBSEFilings } from "@/lib/bse-filings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const filings = await fetchBSEFilings(limit);
    return NextResponse.json({ filings, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Filings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch filings" },
      { status: 500 }
    );
  }
}
