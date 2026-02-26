// app/api/macro/route.ts
import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    return NextResponse.json({ quotes, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Macro API error:", error);
    return NextResponse.json({ error: "Failed to fetch macro data" }, { status: 500 });
  }
}
