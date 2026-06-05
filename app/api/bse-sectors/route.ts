import { NextResponse } from "next/server";
import { fetchBseSectors } from "@/lib/bse-sectors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sectors = await fetchBseSectors();
    return NextResponse.json({
      sectors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bse-sectors] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch BSE sector data", detail: String(error) },
      { status: 500 },
    );
  }
}
