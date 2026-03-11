import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface ReportBrief {
  id: string;
  date: string;
  reportType: string;
  analyst: string;
  rating: string;
  cmp: number;
  targetPrice: number;
}

export interface CoverageEntry {
  symbol: string;
  company: string;
  analysts: string[];        // unique, sorted by most recent activity
  latestRating: string;
  latestTarget: number;
  latestCmp: number;
  reportCount: number;
  latestDate: string;
  firstDate: string;
  latestReportType: string;
  reports: ReportBrief[];    // ALL reports for this symbol, date DESC
}

export async function GET() {
  try {
    const db = await getDb();

    const rows = db
      .prepare(
        `SELECT id, analyst, company, symbol, reportType, date, rating, cmp, targetPrice
         FROM reports
         WHERE symbol IS NOT NULL AND symbol != ''
         ORDER BY symbol ASC, date DESC`
      )
      .all() as Array<{
        id: string;
        analyst: string;
        company: string;
        symbol: string;
        reportType: string;
        date: string;
        rating: string;
        cmp: number;
        targetPrice: number;
      }>;

    // Group by symbol
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!grouped.has(r.symbol)) grouped.set(r.symbol, []);
      grouped.get(r.symbol)!.push(r);
    }

    const coverage: CoverageEntry[] = [];
    for (const [symbol, reports] of grouped) {
      // rows already sorted date DESC per symbol
      const latest = reports[0];
      const analysts = [
        ...new Set(reports.map((r) => r.analyst).filter(Boolean)),
      ];

      coverage.push({
        symbol,
        company: latest.company,
        analysts,
        latestRating: latest.rating,
        latestTarget: latest.targetPrice,
        latestCmp: latest.cmp,
        reportCount: reports.length,
        latestDate: latest.date,
        firstDate: reports[reports.length - 1].date,
        latestReportType: latest.reportType,
        reports: reports.map((r) => ({
          id: r.id,
          date: r.date,
          reportType: r.reportType,
          analyst: r.analyst,
          rating: r.rating,
          cmp: r.cmp,
          targetPrice: r.targetPrice,
        })),
      });
    }

    // Sort by latest report date DESC
    coverage.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

    return NextResponse.json(coverage);
  } catch (err) {
    console.error("Coverage API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
