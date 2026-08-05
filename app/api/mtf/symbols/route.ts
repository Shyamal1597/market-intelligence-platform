import { NextResponse } from "next/server";
import { getAllSymbols } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/mtf/symbols
 * Every symbol in the full universe (matches the "Symbols w/ Data" tile
 * count) -- backs the header's all-symbols search bar, fetched once on
 * first use rather than on every page load.
 */
export async function GET() {
  const rows = await getAllSymbols();
  return NextResponse.json({ rows });
}
