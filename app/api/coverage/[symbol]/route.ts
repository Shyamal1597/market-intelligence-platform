import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface InsightsReport {
  id: string;
  reportType: string;
  date: string;
  analyst: string;
  company: string;
  rating: string;
  targetPrice: number;
}

export interface InsightsData {
  report: InsightsReport | null;
  chunks: Array<{ text: string; pageNum: number }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const db = await getDb();

    // Prefer the most recent IC; fall back to most recent report of any type
    const latestReport = db
      .prepare(
        `SELECT id, reportType, date, analyst, company, rating, targetPrice
         FROM reports
         WHERE symbol = ?
         ORDER BY
           CASE reportType WHEN 'IC' THEN 0 WHEN 'RU' THEN 1 ELSE 2 END ASC,
           date DESC
         LIMIT 1`
      )
      .get(symbol.toUpperCase()) as InsightsReport | undefined;

    if (!latestReport) {
      return NextResponse.json({ report: null, chunks: [] } as InsightsData);
    }

    // Return all meaningful chunks — client can page/truncate
    const chunks = db
      .prepare(
        `SELECT text, pageNum
         FROM chunks
         WHERE reportId = ? AND length(text) > 150
         ORDER BY pageNum ASC
         LIMIT 30`
      )
      .all(latestReport.id) as InsightsData["chunks"];

    return NextResponse.json({ report: latestReport, chunks } satisfies InsightsData);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
