import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseFinancials } from "@/lib/pdf-financials-parser";
import type { FinancialSnapshot } from "@/lib/pdf-financials-parser";

export const dynamic = "force-dynamic";
// v2 parser

export interface FinancialsResponse extends FinancialSnapshot {
  reportType: string;
  date: string;
  company: string;
  analyst: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const db = await getDb();

    // Prefer IC, then most recent report
    const report = db
      .prepare(
        `SELECT id, reportType, date, analyst, company
         FROM reports
         WHERE symbol = ?
         ORDER BY
           CASE reportType WHEN 'IC' THEN 0 WHEN 'RU' THEN 1 ELSE 2 END ASC,
           date DESC
         LIMIT 1`
      )
      .get(symbol.toUpperCase()) as
      | { id: string; reportType: string; date: string; analyst: string; company: string }
      | undefined;

    if (!report) {
      return NextResponse.json({ error: "No report found" }, { status: 404 });
    }

    // Get ALL chunks (no length filter) for maximum parsing coverage
    const chunks = db
      .prepare(
        `SELECT text, pageNum
         FROM chunks
         WHERE reportId = ?
         ORDER BY pageNum ASC`
      )
      .all(report.id) as Array<{ text: string; pageNum: number }>;

    const snapshot = parseFinancials(chunks, report.reportType);

    const response: FinancialsResponse = {
      reportType: report.reportType,
      date: report.date,
      company: report.company,
      analyst: report.analyst,
      ...snapshot,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[financials]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
