// app/api/calendar/route.ts
import { NextResponse } from "next/server";
import { fetchBoardMeetings } from "@/lib/bse-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await fetchBoardMeetings();
    return NextResponse.json({ entries, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Calendar API error:", error);
    return NextResponse.json({ entries: [], fetchedAt: new Date().toISOString() });
  }
}
