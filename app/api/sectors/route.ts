import { NextResponse } from "next/server";
import { fetchSectorQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchSectorQuotes();
    return NextResponse.json({ quotes, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Sectors API error:", error);
    return NextResponse.json({ error: "Failed to fetch sector data" }, { status: 500 });
  }
}
