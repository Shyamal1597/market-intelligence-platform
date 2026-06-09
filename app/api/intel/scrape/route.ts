import { NextResponse } from "next/server";
import { scrapeBSETranscripts, readScrapeLog } from "@/lib/intel/bse-transcript-scraper";

/**
 * POST /api/intel/scrape
 *
 * Trigger a BSE transcript scrape. Fetches recent BSE filings, identifies
 * transcript PDFs for tracked stocks, downloads them, and triggers the pipeline.
 *
 * Body (optional JSON):
 *   { "symbols": ["HDFCBANK", "TCS"] }  -- filter to specific symbols
 *   { "dryRun": true }                  -- scan but don't trigger pipeline
 *
 * This endpoint is designed to be called by:
 *   1. A system cron job (every 4 hours during results season)
 *   2. Manually from the admin UI
 */
export async function POST(req: Request) {
  try {
    let symbols: string[] | undefined;
    let dryRun = false;

    try {
      const body = await req.json();
      if (Array.isArray(body?.symbols)) {
        symbols = body.symbols.map((s: unknown) => String(s).toUpperCase());
      }
      if (body?.dryRun === true) dryRun = true;
    } catch {
      // No body or invalid JSON -- run with defaults
    }

    const result = await scrapeBSETranscripts({
      triggerPipeline: !dryRun,
      symbolFilter: symbols,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (e) {
    console.error("[intel/scrape] Error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/intel/scrape
 *
 * Returns the scrape log -- history of past scrape runs.
 * Query params:
 *   ?limit=10  -- number of recent entries (default: 20)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
    const log = await readScrapeLog();
    return NextResponse.json({
      entries: log.slice(-limit).reverse(),
    });
  } catch (e) {
    console.error("[intel/scrape] Error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
