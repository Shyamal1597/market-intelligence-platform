/**
 * GET /api/eod-export
 *
 * Generates the daily EOD Snippets Excel report in the exact Sunidhi format
 * (B7:J44 layout). Fetches live data from all wired-in streams and returns
 * the file as a downloadable .xlsx attachment.
 *
 * Sections:
 *   - FII/FPI & DII trading activity (daily + MTD + YTD)
 *   - Sectorial Contribution in SENSEX (blank — analyst fills post 7pm)
 *   - Commodities: Gold, Silver, Brent, Nymex, Natural Gas
 *   - Asia Pacific: Shanghai, GIFT NIFTY, Nikkei 225, Hang Seng
 *   - Europe: FTSE 100, DAX, CAC
 *   - America: Dow Jones, S&P 500, Nasdaq Composite
 *   - Sunidhi disclaimer / footer
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { fetchAllFlowData } from "@/lib/nse-flows";
import { fetchAllQuotes, fetchGlobalQuotes } from "@/lib/yahoo-finance";
import type { QuoteData } from "@/lib/yahoo-finance";
import { computePeriodTotals, fyLabel } from "@/lib/flow-periods";

export const dynamic = "force-dynamic";

// ── Cell helpers ──────────────────────────────────────────────────────────────

/** Excel cell address from 1-based row and column numbers (B = col 2). */
function addr(row: number, col: number): string {
  return XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
}

/** Merge range from 1-based row/col coordinates. */
function merge(r1: number, c1: number, r2: number, c2: number): XLSX.Range {
  return { s: { r: r1 - 1, c: c1 - 1 }, e: { r: r2 - 1, c: c2 - 1 } };
}

function str(v: string): XLSX.CellObject {
  return { v, t: "s" };
}

function num(v: number, z = "#,##0.00"): XLSX.CellObject {
  return { v, t: "n", z } as XLSX.CellObject;
}

function pct(v: number): XLSX.CellObject {
  // Store as decimal, format as percentage (e.g. -0.0235 → -2.35%)
  return { v: v / 100, t: "n", z: "0.00%" } as XLSX.CellObject;
}

function dateCell(d: Date): XLSX.CellObject {
  return { v: d, t: "d", z: "DD-MMM-YY" } as XLSX.CellObject;
}

function findQ(quotes: QuoteData[], symbol: string): QuoteData | undefined {
  return quotes.find((q) => q.symbol === symbol);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Fetch all data concurrently
    const [flowData, macroQuotes, globalQuotes] = await Promise.all([
      fetchAllFlowData(),
      fetchAllQuotes(),
      fetchGlobalQuotes(),
    ]);

    const { entries, snapshot } = flowData;
    const today = new Date();
    const fy = fyLabel(today);

    // Period totals — FII (computePeriodTotals), DII computed inline
    const fiiTotals = computePeriodTotals(entries, today);

    // DII period sums (same period logic as computePeriodTotals)
    const diiMtd = entries
      .filter((e) => e.date.slice(0, 7) >= fiiTotals.startOfMonth)
      .reduce((s, e) => s + e.diiEquityNet, 0);
    const diiYtd = entries
      .filter((e) => e.date.slice(0, 7) >= fiiTotals.startOfFy)
      .reduce((s, e) => s + e.diiEquityNet, 0);

    // Merge both quote sets for a single lookup pool
    const allQuotes: QuoteData[] = [
      ...macroQuotes,
      ...globalQuotes.map(({ region: _r, ...q }) => q),
    ];

    // Current time for CMP header stamps
    const timeStamp = today.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // Date of FII/DII data (use snapshot date if available, else today)
    const fiiDate = snapshot
      ? new Date((snapshot as { date?: string }).date ?? today.toISOString().slice(0, 10))
      : today;

    // FY label for MTD/YTD headers (e.g. "FY26")
    const fyLabel2526 = `FY ${fy}`; // e.g. "FY FY26" → cleaner: just use fy

    // ── Build worksheet ──────────────────────────────────────────────────────
    const ws: XLSX.WorkSheet = {};
    const merges: XLSX.Range[] = [];

    // ── Row 9: Date ─────────────────────────────────────────────────────────
    // H9:I9 merged — matches original (single date cell in top-right area)
    merges.push(merge(9, 8, 9, 9));
    ws[addr(9, 8)] = dateCell(today);

    // ── Row 11: FII/DII section title ────────────────────────────────────────
    merges.push(merge(11, 2, 11, 9));
    ws[addr(11, 2)] = str(
      "FII/FPI/DII trading activity across Indian Exchanges – CM (Rs. In Cr.)"
    );

    // ── Row 12: Column headers ───────────────────────────────────────────────
    merges.push(merge(12, 2, 12, 3));
    ws[addr(12, 2)] = str("Category");
    ws[addr(12, 4)] = str("Date");
    ws[addr(12, 5)] = str("Buy Value");
    ws[addr(12, 6)] = str("Sell Value");
    ws[addr(12, 7)] = str("Net Value");
    ws[addr(12, 8)] = str(`MTD (${fy})`);
    ws[addr(12, 9)] = str(`YTD (${fy})`);

    // ── Row 13: FII/FPI data ─────────────────────────────────────────────────
    merges.push(merge(13, 2, 13, 3));
    ws[addr(13, 2)] = str("FII/FPI");
    ws[addr(13, 4)] = dateCell(fiiDate);
    ws[addr(13, 5)] = num(snapshot?.fiiEquityBuy ?? 0);
    ws[addr(13, 6)] = num(snapshot?.fiiEquitySell ?? 0);
    ws[addr(13, 7)] = num(snapshot?.fiiEquityNet ?? 0);
    ws[addr(13, 8)] = num(fiiTotals.mtd);
    ws[addr(13, 9)] = num(fiiTotals.ytd);

    // ── Row 14: DII data ─────────────────────────────────────────────────────
    merges.push(merge(14, 2, 14, 3));
    ws[addr(14, 2)] = str("DII");
    ws[addr(14, 4)] = dateCell(fiiDate);
    ws[addr(14, 5)] = num(snapshot?.diiEquityBuy ?? 0);
    ws[addr(14, 6)] = num(snapshot?.diiEquitySell ?? 0);
    ws[addr(14, 7)] = num(snapshot?.diiEquityNet ?? 0);
    ws[addr(14, 8)] = num(diiMtd);
    ws[addr(14, 9)] = num(diiYtd);

    // ── Row 16: Sectorial Contribution title ─────────────────────────────────
    merges.push(merge(16, 2, 16, 9));
    ws[addr(16, 2)] = str("Sectorial Contribution in SENSEX");

    // ── Row 17: Sectorial headers (4 paired columns) ─────────────────────────
    ws[addr(17, 2)] = str("Index");
    ws[addr(17, 3)] = str("(%)");
    ws[addr(17, 4)] = str("Index");
    ws[addr(17, 5)] = str("(%)");
    ws[addr(17, 6)] = str("Index");
    ws[addr(17, 7)] = str("(%)");
    ws[addr(17, 8)] = str("Index");
    ws[addr(17, 9)] = str("(%)");

    // ── Rows 18-23: Sectorial data — left blank for analyst to fill post 7pm ─
    // Sector contribution to Sensex is not available from automated streams;
    // analyst fills this section after market close from BSE sector data.
    // (Cells intentionally empty — analyst edits file after export)

    // ── Row 25: Commodities + Asia Pacific headers ────────────────────────────
    ws[addr(25, 2)] = str("Commodity");
    ws[addr(25, 3)] = str(`CMP @ ${timeStamp}`);
    ws[addr(25, 4)] = str("Points");
    ws[addr(25, 5)] = str("(%)");
    ws[addr(25, 6)] = str("Asia Pacific");
    ws[addr(25, 7)] = str(`CMP @ ${timeStamp}`);
    ws[addr(25, 8)] = str("Points");
    ws[addr(25, 9)] = str("(%)");

    // ── Rows 26-30: Commodities ───────────────────────────────────────────────
    const COMMODITIES: Array<{ label: string; sym: string; fmt?: string }> = [
      { label: "Gold", sym: "GC=F", fmt: "#,##0.000" },
      { label: "Silver", sym: "SI=F", fmt: "#,##0.000" },
      { label: "Brent Crude", sym: "BZ=F", fmt: "#,##0.000" },
      { label: "WTI Nymex Crude", sym: "CL=F", fmt: "#,##0.000" },
      { label: "Natural Gas", sym: "NG=F", fmt: "#,##0.000" },
    ];

    COMMODITIES.forEach(({ label, sym, fmt = "#,##0.000" }, i) => {
      const row = 26 + i;
      const q = findQ(allQuotes, sym);
      ws[addr(row, 2)] = str(label);
      ws[addr(row, 3)] = q ? num(q.price, fmt) : str("N/A");
      ws[addr(row, 4)] = q ? num(q.change, fmt) : str("N/A");
      ws[addr(row, 5)] = q ? pct(q.changePercent) : str("N/A");
    });

    // ── Rows 26-29: Asia Pacific ──────────────────────────────────────────────
    // GIFT NIFTY not available from Yahoo Finance — left blank for manual entry
    const ASIA_PACIFIC: Array<{ label: string; sym: string | null }> = [
      { label: "Shanghai Composite", sym: "000001.SS" },
      { label: "GIFT NIFTY", sym: null }, // Not available via Yahoo Finance
      { label: "Nikkei 225", sym: "^N225" },
      { label: "Hang Seng", sym: "^HSI" },
    ];

    ASIA_PACIFIC.forEach(({ label, sym }, i) => {
      const row = 26 + i;
      const q = sym ? findQ(allQuotes, sym) : null;
      ws[addr(row, 6)] = str(label);
      ws[addr(row, 7)] = q ? num(q.price, "#,##0.00") : str("N/A");
      ws[addr(row, 8)] = q ? num(q.change, "#,##0.00") : str("N/A");
      ws[addr(row, 9)] = q ? pct(q.changePercent) : str("N/A");
    });

    // ── Row 32: Europe + America section headers ──────────────────────────────
    merges.push(merge(32, 2, 32, 5));
    ws[addr(32, 2)] = str("Europe");
    merges.push(merge(32, 6, 32, 9));
    ws[addr(32, 6)] = str("America");

    // ── Row 33: Column headers ────────────────────────────────────────────────
    ws[addr(33, 2)] = str("Index");
    ws[addr(33, 3)] = str(`CMP @ ${timeStamp}`);
    ws[addr(33, 4)] = str("Points");
    ws[addr(33, 5)] = str("(%)");
    ws[addr(33, 6)] = str("Index");
    ws[addr(33, 7)] = str(`CMP @ ${timeStamp}`);
    ws[addr(33, 8)] = str("Points");
    ws[addr(33, 9)] = str("(%)");

    // ── Rows 34-36: Europe ────────────────────────────────────────────────────
    const EUROPE = [
      { label: "FTSE 100", sym: "^FTSE" },
      { label: "DAX", sym: "^GDAXI" },
      { label: "CAC", sym: "^FCHI" },
    ];

    EUROPE.forEach(({ label, sym }, i) => {
      const row = 34 + i;
      const q = findQ(allQuotes, sym);
      ws[addr(row, 2)] = str(label);
      ws[addr(row, 3)] = q ? num(q.price, "#,##0.00") : str("N/A");
      ws[addr(row, 4)] = q ? num(q.change, "#,##0.00") : str("N/A");
      ws[addr(row, 5)] = q ? pct(q.changePercent) : str("N/A");
    });

    // ── Rows 34-36: America ───────────────────────────────────────────────────
    const AMERICA = [
      { label: "Dow Jones", sym: "^DJI" },
      { label: "S&P 500", sym: "^GSPC" },
      { label: "Nasdaq Composite", sym: "^IXIC" },
    ];

    AMERICA.forEach(({ label, sym }, i) => {
      const row = 34 + i;
      const q = findQ(allQuotes, sym);
      ws[addr(row, 6)] = str(label);
      ws[addr(row, 7)] = q ? num(q.price, "#,##0.00") : str("N/A");
      ws[addr(row, 8)] = q ? num(q.change, "#,##0.00") : str("N/A");
      ws[addr(row, 9)] = q ? pct(q.changePercent) : str("N/A");
    });

    // ── Rows 38-44: Disclosures & Disclaimer ─────────────────────────────────
    merges.push(merge(38, 2, 38, 9));
    ws[addr(38, 2)] = str("Disclosures and Disclaimer:-");

    merges.push(merge(39, 2, 39, 9));
    ws[addr(39, 2)] = str(
      `This Report is published by Sunidhi Securities & Finance Limited (hereinafter referred to as "Sunidhi") SEBI Research Analyst Registration Number: INH000000000 for private circulation. Sunidhi is a registered Stock Broker with National Stock Exchange of India Limited, BSE Limited and Metropolitan Stock Exchange of India Limited in cash, derivatives and currency derivatives segments. It is also having registration as a Depository Participant with CDSL.\r\n\r\nSunidhi has other business divisions with independent research teams separated by Chinese walls, and therefore may, at times, have different or contrary views on stocks and markets.\r\n\r\nSunidhi or its associates has not been debarred / suspended by SEBI or any other regulatory authority for accessing / dealing in securities Market. Sunidhi or analyst or his relatives do not hold any financial interest in the subject company. Associates may have such interest in its ordinary course of business as a distinct and independent body. Sunidhi or its associates or Analyst do not have any conflict or material conflict of interest at the time of publication of the research report with the company covered by Analyst.\r\n\r\nSunidhi or its associates / analyst has not received any compensation / managed or co-managed public offering of securities of the company covered by Analyst during the past twelve months. Sunidhi or its associates has not received any compensation or other benefits from the company covered by Analyst or third party in connection with the research report. Analyst has not served as an officer, director or employee of subject company and Sunidhi / analyst has not been engaged in market making activity of the subject company.\r\n\r\nAnalyst or his relatives do not hold beneficial ownership of 1% or more in the subject company at the end of the month immediately preceding the date of publication of this research report. Sunidhi or its associates may have investment positions in the stocks recommended in this report, which may have beneficial ownership of 1% or more in the subject company at the end of the month immediately preceding the date of publication of this research report. However, Sunidhi is maintaining Chinese wall between other business divisions or activities. Analyst has exercised due diligence in checking correctness of details and opinion expressed herein is unbiased.\r\n\r\nThis report is meant for personal informational purposes and is not be construed as a solicitation or financial advice or an offer to buy or sell any securities or related financial instruments. While utmost care has been taken in preparing this report, we claim no responsibility for its accuracy. Recipients should not regard the report as a substitute for the exercise of their own judgment. Any opinions expressed in this report are subject to change without any notice and this report is not under any obligation to update or keep current the information contained herein. Past performance is not necessarily indicative of future results. This report accepts no liability whatsoever for any loss or damage of any kind arising out of the use of all or any part of this report.\r\n\r\nThe information in this document has been printed on the basis of publicly available information, internal data and other reliable sources believed to be true, but we do not represent that it is accurate or complete and it should not be relied on as such, as this document is for general guidance only. Sunidhi or any of its affiliates/ group companies shall not be in any way responsible for any loss or damage that may arise to any person from any inadvertent error in the information contained in this report.`
    );

    merges.push(merge(40, 2, 40, 9));
    ws[addr(40, 2)] = str(
      "Sunidhi Securities & Finance Ltd. – Research Analyst – INH000000000"
    );

    merges.push(merge(41, 2, 41, 9));
    ws[addr(41, 2)] = str(
      "Registered office address (configure via MTF_COMPLIANCE_ADDRESS)"
    );

    ws[addr(42, 2)] = str("Bombay Stock Exchange (BSE)      ");
    ws[addr(42, 4)] = str("National Stock Exchange of India Ltd (NSE)");
    ws[addr(42, 7)] = str("Metropolitan Stock Exchange of India Limited (MSEI)");

    ws[addr(43, 2)] = str("Registration no. INZ000000000 ");
    ws[addr(43, 4)] = str("Registration no. INZ000000000 ");
    ws[addr(43, 7)] = str("Registration no. INZ000000000 ");

    ws[addr(44, 2)] = str("Compliance Officer Name: ");
    ws[addr(44, 4)] = str("Compliance Officer Name");
    ws[addr(44, 7)] = str("Phone No: +91-00000-00000");

    // ── Worksheet metadata ────────────────────────────────────────────────────
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 6, c: 1 }, e: { r: 43, c: 9 } }); // B7:J44
    ws["!merges"] = merges;

    // Column widths (A through J)
    ws["!cols"] = [
      { wch: 2 },   // A — unused
      { wch: 24 },  // B — primary label
      { wch: 16 },  // C — CMP / data
      { wch: 12 },  // D — points / data
      { wch: 10 },  // E — %
      { wch: 24 },  // F — secondary label
      { wch: 16 },  // G — CMP / data
      { wch: 12 },  // H — points / MTD
      { wch: 12 },  // I — % / YTD
      { wch: 2 },   // J — buffer
    ];

    // Row heights: tall row for disclaimer text
    ws["!rows"] = Array.from({ length: 44 }, (_, i) => {
      if (i === 38) return { hpt: 200 }; // Row 39 (0-indexed 38) = disclaimer text
      return {};
    });

    // ── Build workbook and return ─────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const dateSuffix = today
      .toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
      .replace(/\//g, ".");

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="EOD Snippets on Market MISC - ${dateSuffix}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("EOD export error:", error);
    return NextResponse.json(
      { error: "Failed to generate EOD report", detail: String(error) },
      { status: 500 }
    );
  }
}
