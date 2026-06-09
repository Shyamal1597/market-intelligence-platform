import { NextResponse } from "next/server";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { listJobs } from "@/lib/intel/pipeline";

/**
 * GET /api/intel/jobs
 *
 * List recent pipeline jobs.
 * Query params:
 *   ?symbol=HDFCBANK  -- filter by symbol
 *   ?limit=20         -- max results (default: 20, max: 100)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbolRaw = url.searchParams.get("symbol")?.toUpperCase();
    const symbol = symbolRaw && SYMBOL_SECTOR[symbolRaw] ? symbolRaw : undefined;
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "20") || 20, 1),
      100,
    );

    const jobs = await listJobs(symbol, limit);
    return NextResponse.json({ jobs });
  } catch (e) {
    console.error("[intel/jobs] Error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
