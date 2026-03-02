import { NextResponse } from "next/server";
import { fetchAllFlowData } from "@/lib/nse-flows";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllFlowData();
    return NextResponse.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Flows API error:", error);
    return NextResponse.json(
      { entries: [], snapshot: null, nifty: [], fetchedAt: new Date().toISOString(), error: "Internal server error" },
      { status: 500 }
    );
  }
}
