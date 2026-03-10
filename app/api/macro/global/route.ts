import { NextResponse } from "next/server";
import { fetchGlobalQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchGlobalQuotes();
    return NextResponse.json({ quotes, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Global macro API error:", error);
    return NextResponse.json({ error: "Failed to fetch global data" }, { status: 500 });
  }
}
