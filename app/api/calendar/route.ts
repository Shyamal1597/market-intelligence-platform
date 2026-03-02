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
    // Fix 4: return 500 instead of 200 when an unhandled error occurs
    return NextResponse.json(
      { entries: [], fetchedAt: new Date().toISOString(), error: "Internal server error" },
      { status: 500 }
    );
  }
}
