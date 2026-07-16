/**
 * GET /api/eod-export
 *
 * Generates the daily EOD Snippets Excel report. Layout, fonts, borders,
 * column widths and section styling are matched cell-by-cell against a real
 * Sunidhi-authored report (2026-07-15).
 *
 * The red/blue title banner in the real file is NOT a colored cell fill --
 * it's a floating shape/textbox, which ExcelJS's read API doesn't expose
 * (only raster picture drawings, not native Excel shapes). It's rebuilt here
 * with cell fills instead, which renders the same but can't be verified
 * against the source file's exact shape properties the way everything else
 * in this file was. Every other style choice below (the light-gray header
 * fill via Excel's theme color "Background 1, Darker 25%", black bold
 * header text, center-aligned data, no fill on footer/disclaimer rows) IS
 * verified cell-by-cell against the real file.
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchAllFlowData } from "@/lib/nse-flows";
import { fetchAllQuotes, fetchGlobalQuotes } from "@/lib/yahoo-finance";
import type { QuoteData } from "@/lib/yahoo-finance";
import { computePeriodTotals } from "@/lib/flow-periods";
import { fetchBseSectors, mapEodSectors } from "@/lib/bse-sectors";

export const dynamic = "force-dynamic";

// -- Palette -------------------------------------------------------------------

const A = (hex: string) => `FF${hex}`; // prepend full-opacity alpha

const C = {
  posGreen: A("00B050"),
  negRed:   A("FF0000"),
  black:    A("000000"),
  midGray:  A("808080"),
  bannerRed:  A("C00000"),
  bannerBlue: A("1F3864"),
  white:      A("FFFFFF"),
};

/** Excel theme color "White, Background 1, Darker 25%" -- the exact fill
 * used on every header row in the real template (confirmed via raw XML
 * read: {theme:0, tint:-0.35}, not a literal hex -- a plain hex guess
 * would silently mismatch if the workbook's theme palette ever changes). */
const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { theme: 0, tint: -0.3499862666707358 },
};

const THIN = { style: "thin" as const, color: { argb: C.black } };

/** Draws a border around only the OUTER perimeter of a range -- matches the
 * reference template's "boxed section" look (no internal grid lines). */
function boxBorder(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      const border: Partial<ExcelJS.Borders> = { ...cell.border };
      if (r === r1) border.top = THIN;
      if (r === r2) border.bottom = THIN;
      if (c === c1) border.left = THIN;
      if (c === c2) border.right = THIN;
      cell.border = border;
    }
  }
}

/** A full-width horizontal rule (used to separate a section title from its column headers). */
function hRule(ws: ExcelJS.Worksheet, r: number, c1: number, c2: number) {
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(r, c);
    cell.border = { ...cell.border, bottom: THIN };
  }
}

// -- Style appliers -------------------------------------------------------------

/** Section title, e.g. "FII/FPI/DII trading activity...", "Sectorial Contribution in SENSEX". */
function sectionTitle(cell: ExcelJS.Cell, text: string, size = 14) {
  cell.value = text;
  cell.fill = HEADER_FILL;
  cell.font = { bold: true, size, name: "Calibri" };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

/** Column header, e.g. "Category", "Buy Value", "Index", "(%)". */
function colHdr(cell: ExcelJS.Cell, text: string, size = 14, alignLeft = false) {
  cell.value = text;
  cell.fill = HEADER_FILL;
  cell.font = { bold: true, size, name: "Calibri" };
  cell.alignment = { horizontal: alignLeft ? "left" : "center", vertical: "middle", wrapText: true };
}

function label(cell: ExcelJS.Cell, text: string, size = 11) {
  cell.value = text;
  cell.font = { name: "Calibri", size, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function neutral(cell: ExcelJS.Cell, value: number, fmt = "#,##0.00", size = 11) {
  cell.value = value;
  cell.numFmt = fmt;
  cell.font = { name: "Calibri", size, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function colored(cell: ExcelJS.Cell, value: number | null, fmt = "#,##0.00", size = 11) {
  if (value === null) {
    cell.value = "N/A";
    cell.font = { name: "Calibri", size, color: { argb: C.midGray } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    return;
  }
  cell.value = value;
  cell.numFmt = fmt;
  cell.font = {
    name: "Calibri", size,
    color: { argb: value > 0 ? C.posGreen : value < 0 ? C.negRed : C.black },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function coloredPct(cell: ExcelJS.Cell, value: number | null, size = 11) {
  if (value === null) {
    cell.value = "N/A";
    cell.font = { name: "Calibri", size, color: { argb: C.midGray } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    return;
  }
  cell.value = value / 100;
  cell.numFmt = "0.00%";
  cell.font = {
    name: "Calibri", size,
    color: { argb: value > 0 ? C.posGreen : value < 0 ? C.negRed : C.black },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

/** Sectorial-contribution cells are bold and plain black in the real template
 * (not colored by sign) -- matched exactly, not a design choice made here. */
function sectorLabel(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.font = { bold: true, size: 9, name: "Calibri" };
}

function sectorPct(cell: ExcelJS.Cell, value: number) {
  cell.value = value / 100;
  cell.numFmt = "0.00%";
  cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: C.black } };
  cell.alignment = { horizontal: "center" };
}

// -- GIFT NIFTY from giftnifty.org ----------------------------------------------
// NSE's own site is behind Akamai bot protection and unreliable to scrape
// headlessly (confirmed 2026-07-16). giftnifty.org is a small, plain
// server-rendered page with the same figure, and scrapes cleanly.

// -- FY label: "FY 26-27" format -----------------------------------------------

function fyLongLabel(d: Date): string {
  const endYear = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY ${String(endYear - 1).slice(-2)}-${String(endYear).slice(-2)}`;
}

// -- Main route -----------------------------------------------------------------

export async function GET() {
  try {
    const [flowData, macroQuotes, globalQuotes, bseSectors] = await Promise.all([
      fetchAllFlowData(),
      fetchAllQuotes(), // includes GIFT NIFTY (see lib/gift-nifty.ts)
      fetchGlobalQuotes(),
      fetchBseSectors().catch(() => []), // non-fatal: blank rows if BSE is down
    ]);

    const eodSectors = mapEodSectors(bseSectors);

    const { entries, snapshot } = flowData;
    const today = new Date();

    const fiiTotals = computePeriodTotals(entries, today);
    const fy = fyLongLabel(today);

    const diiMtd = entries
      .filter((e) => e.date.slice(0, 7) >= fiiTotals.startOfMonth)
      .reduce((s, e) => s + e.diiEquityNet, 0);
    const diiYtd = entries
      .filter((e) => e.date.slice(0, 7) >= fiiTotals.startOfFy)
      .reduce((s, e) => s + e.diiEquityNet, 0);

    const pool: QuoteData[] = [
      ...macroQuotes,
      ...globalQuotes.map(({ region: _r, ...q }) => q),
    ];
    const Q = (sym: string) => pool.find((q) => q.symbol === sym) ?? null;

    const timeStamp = today.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });

    const dateStr = today.toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
    });

    const fiiDateStr = (() => {
      const raw = (snapshot as { date?: string } | null)?.date;
      return raw
        ? new Date(raw).toLocaleDateString("en-IN", {
            day: "2-digit", month: "long", year: "numeric",
          })
        : dateStr;
    })();

    // -- Workbook setup --------------------------------------------------------
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sunidhi Research";
    const ws = wb.addWorksheet("Sheet1");

    // Column widths (1=A ... 9=I) -- match the real template exactly.
    const WIDTHS = [6.44, 18.11, 18.11, 18.11, 18.11, 18.11, 18.11, 18.55, 18.11];
    WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // -- Rows 1-7: branded banner -------------------------------------------
    // Rebuilt with cell fills -- the real file draws this as a floating
    // shape (not a cell fill), which ExcelJS can't read back out. Same
    // rendered look, different underlying mechanism.
    const blueFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: C.bannerBlue } };
    const redFill  = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: C.bannerRed } };

    for (const r of [1, 2]) {
      ws.getRow(r).height = 7;
      for (let c = 1; c <= 9; c++) ws.getCell(r, c).fill = redFill;
    }
    for (const r of [3, 4, 5, 6]) {
      ws.getRow(r).height = 22;
      for (let c = 1; c <= 9; c++) ws.getCell(r, c).fill = blueFill;
    }
    ws.mergeCells(3, 2, 6, 6);
    const titleCell = ws.getCell(3, 2);
    titleCell.value = "EOD Snippets On Market";
    titleCell.fill = blueFill;
    titleCell.font = { bold: true, size: 18, color: { argb: C.white }, name: "Calibri" };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    ws.getRow(7).height = 5;
    for (let c = 1; c <= 9; c++) ws.getCell(7, c).fill = redFill;

    try {
      const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
      const imgId = wb.addImage({ buffer: readFileSync(logoPath) as never, extension: "png" });
      ws.addImage(imgId, {
        tl: { col: 6.2, row: 1 },
        br: { col: 8.9, row: 6.7 },
        editAs: "oneCell",
      } as never);
    } catch { /* logo not found -- skip */ }

    ws.getRow(8).height = 8;

    // -- Row 9: Date, right-aligned in H9:I9 only ------------------------------
    ws.getRow(9).height = 18;
    ws.mergeCells(9, 8, 9, 9);
    const dateCell = ws.getCell(9, 8);
    dateCell.value = dateStr;
    dateCell.font = { bold: true, size: 14, name: "Calibri" };
    dateCell.alignment = { horizontal: "center" };

    // -- Row 11: FII section title ----------------------------------------------
    ws.getRow(11).height = 18;
    ws.mergeCells(11, 2, 11, 9);
    sectionTitle(ws.getCell(11, 2), "FII/FPI/DII trading activity across Indian Exchanges - CM (Rs. In Cr.)");

    // -- Row 12: column headers -------------------------------------------------
    ws.getRow(12).height = 18;
    ws.mergeCells(12, 2, 12, 3);
    colHdr(ws.getCell(12, 2), "Category");
    ([ [4, "Date"], [5, "Buy Value"], [6, "Sell Value"],
       [7, "Net Value"], [8, `MTD (${fy})`], [9, `YTD (${fy})`] ] as [number, string][])
      .forEach(([c, t]) => colHdr(ws.getCell(12, c), t));

    // -- Row 13: FII/FPI --------------------------------------------------------
    ws.mergeCells(13, 2, 13, 3);
    label(ws.getCell(13, 2), "FII/FPI");
    label(ws.getCell(13, 4), fiiDateStr);
    neutral(ws.getCell(13, 5), snapshot?.fiiEquityBuy ?? 0);
    neutral(ws.getCell(13, 6), snapshot?.fiiEquitySell ?? 0);
    colored(ws.getCell(13, 7), snapshot?.fiiEquityNet ?? 0);
    colored(ws.getCell(13, 8), fiiTotals.mtd, "#,##0.00", 10);
    colored(ws.getCell(13, 9), fiiTotals.ytd, "#,##0.00", 10);

    // -- Row 14: DII ------------------------------------------------------------
    ws.mergeCells(14, 2, 14, 3);
    label(ws.getCell(14, 2), "DII");
    label(ws.getCell(14, 4), fiiDateStr);
    neutral(ws.getCell(14, 5), snapshot?.diiEquityBuy ?? 0);
    neutral(ws.getCell(14, 6), snapshot?.diiEquitySell ?? 0);
    colored(ws.getCell(14, 7), snapshot?.diiEquityNet ?? 0);
    colored(ws.getCell(14, 8), diiMtd, "#,##0.00", 10);
    colored(ws.getCell(14, 9), diiYtd, "#,##0.00", 10);

    boxBorder(ws, 11, 2, 14, 9);
    hRule(ws, 11, 2, 9);

    // -- Row 16: Sectorial title -------------------------------------------------
    ws.getRow(16).height = 18;
    ws.mergeCells(16, 2, 16, 9);
    sectionTitle(ws.getCell(16, 2), "Sectorial Contribution in SENSEX");

    // -- Row 17: sectorial column headers ---------------------------------------
    ws.getRow(17).height = 18;
    ([2, 4, 6, 8] as number[]).forEach((c) => colHdr(ws.getCell(17, c), "Index", 14, true));
    ([3, 5, 7, 9] as number[]).forEach((c) => colHdr(ws.getCell(17, c), "(%)"));

    // -- Rows 18-23: BSE SENSEX sectorial data (6 rows x 4 sector pairs) -------
    for (let row = 18; row <= 23; row++) {
      const baseIdx = (row - 18) * 4;
      const COL_PAIRS: [number, number][] = [[2, 3], [4, 5], [6, 7], [8, 9]];

      COL_PAIRS.forEach(([cLabel, cPct], colIdx) => {
        const s = eodSectors[baseIdx + colIdx];
        if (s) {
          sectorLabel(ws.getCell(row, cLabel), s.label);
          sectorPct(ws.getCell(row, cPct), s.changePercent);
        }
      });
    }

    boxBorder(ws, 16, 2, 23, 9);
    hRule(ws, 16, 2, 9);
    hRule(ws, 17, 2, 9);

    // -- Row 25/26: Commodity + Asia Pacific (staggered header, matches template) ---
    // Commodity's own header sits on row 25; Asia Pacific gets a section title on
    // row 25 (merged F25:I25) with its OWN Index/CMP/Points/(%) header one row
    // below (row 26) -- so Commodities has 5 data rows (26-30) but Asia Pacific
    // only has 4 (27-30), both ending together at row 30. This offset is real,
    // verified cell-by-cell against the reference -- not a bug to "fix".
    ws.getRow(25).height = 16;
    ([ [2, "Commodity"], [3, `CMP @\n${timeStamp}`], [4, "Points"], [5, "(%)"] ] as [number, string][])
      .forEach(([c, t]) => colHdr(ws.getCell(25, c), t, 12, c === 2));
    ws.mergeCells(25, 6, 25, 9);
    sectionTitle(ws.getCell(25, 6), "Asia Pacific", 12);

    ws.getRow(26).height = 16;
    ([ [6, "Index"], [7, `CMP @\n${timeStamp}`], [8, "Points"], [9, "(%)"] ] as [number, string][])
      .forEach(([c, t]) => colHdr(ws.getCell(26, c), t, 12, c === 6));

    const COMMODITIES = [
      { label: "Gold",            sym: "GC=F", fmt: "#,##0.000" },
      { label: "Silver",          sym: "SI=F", fmt: "#,##0.000" },
      { label: "Brent Crude",     sym: "BZ=F", fmt: "#,##0.000" },
      { label: "WTI Nymex Crude", sym: "CL=F", fmt: "#,##0.000" },
      { label: "Natural Gas",     sym: "NG=F", fmt: "#,##0.000" },
    ];
    const APAC = [
      { label: "Shanghai Composite", sym: "000001.SS" },
      { label: "GIFT NIFTY",         sym: "GIFT_NIFTY" },
      { label: "Nikkei 225",        sym: "^N225" },
      { label: "Hang Seng",         sym: "^HSI" },
    ];

    for (let i = 0; i < COMMODITIES.length; i++) {
      const row = 26 + i;
      const cm = COMMODITIES[i];
      const cmQ = Q(cm.sym);
      label(ws.getCell(row, 2), cm.label);
      ws.getCell(row, 2).alignment = { horizontal: "left", vertical: "middle" };
      if (cmQ) {
        neutral(ws.getCell(row, 3), cmQ.price, cm.fmt);
        colored(ws.getCell(row, 4), cmQ.change, cm.fmt);
        coloredPct(ws.getCell(row, 5), cmQ.changePercent);
      } else {
        [3, 4, 5].forEach((c) => colored(ws.getCell(row, c), null));
      }
    }

    for (let i = 0; i < APAC.length; i++) {
      const row = 27 + i;
      const ap = APAC[i];
      const apQ = Q(ap.sym);
      label(ws.getCell(row, 6), ap.label);
      ws.getCell(row, 6).alignment = { horizontal: "left", vertical: "middle" };
      if (apQ) {
        neutral(ws.getCell(row, 7), apQ.price, "#,##0.00");
        colored(ws.getCell(row, 8), apQ.change, "#,##0.00");
        coloredPct(ws.getCell(row, 9), apQ.changePercent);
      } else {
        [7, 8, 9].forEach((c) => colored(ws.getCell(row, c), null));
      }
    }

    boxBorder(ws, 25, 2, 30, 5);
    boxBorder(ws, 25, 6, 30, 9);
    hRule(ws, 26, 6, 9);

    // -- Row 32/33: Europe + America ---------------------------------------------
    ws.getRow(32).height = 16;
    ws.mergeCells(32, 2, 32, 5);
    sectionTitle(ws.getCell(32, 2), "Europe", 12);
    ws.mergeCells(32, 6, 32, 9);
    sectionTitle(ws.getCell(32, 6), "America", 12);

    ws.getRow(33).height = 16;
    ([ [2, "Index"], [3, `CMP @\n${timeStamp}`], [4, "Points"], [5, "(%)"],
       [6, "Index"], [7, `CMP @\n${timeStamp}`], [8, "Points"], [9, "(%)"] ] as [number, string][])
      .forEach(([c, t]) => colHdr(ws.getCell(33, c), t, 12, c === 2 || c === 6));

    const EUROPE = [
      { label: "FTSE 100", sym: "^FTSE" },
      { label: "DAX",      sym: "^GDAXI" },
      { label: "CAC",      sym: "^FCHI" },
    ];
    const AMERICA = [
      { label: "Dow Jones",        sym: "^DJI" },
      { label: "S&P 500",          sym: "^GSPC" },
      { label: "Nasdaq Composite", sym: "^IXIC" },
    ];

    for (let i = 0; i < 3; i++) {
      const row = 34 + i;

      const eu = EUROPE[i];
      const euQ = Q(eu.sym);
      label(ws.getCell(row, 2), eu.label);
      ws.getCell(row, 2).alignment = { horizontal: "left", vertical: "middle" };
      if (euQ) {
        neutral(ws.getCell(row, 3), euQ.price, "#,##0.00");
        colored(ws.getCell(row, 4), euQ.change, "#,##0.00");
        coloredPct(ws.getCell(row, 5), euQ.changePercent);
      } else {
        [3, 4, 5].forEach((c) => colored(ws.getCell(row, c), null));
      }

      const am = AMERICA[i];
      const amQ = Q(am.sym);
      label(ws.getCell(row, 6), am.label);
      ws.getCell(row, 6).alignment = { horizontal: "left", vertical: "middle" };
      if (amQ) {
        neutral(ws.getCell(row, 7), amQ.price, "#,##0.00");
        colored(ws.getCell(row, 8), amQ.change, "#,##0.00");
        coloredPct(ws.getCell(row, 9), amQ.changePercent);
      } else {
        [7, 8, 9].forEach((c) => colored(ws.getCell(row, c), null));
      }
    }

    boxBorder(ws, 32, 2, 36, 5);
    boxBorder(ws, 32, 6, 36, 9);
    hRule(ws, 33, 2, 9);

    // -- Row 38: Disclaimer header ----------------------------------------------
    ws.getRow(38).height = 18;
    ws.mergeCells(38, 2, 38, 9);
    const discHdr = ws.getCell(38, 2);
    discHdr.value = "Disclosures and Disclaimer:-";
    discHdr.font = { bold: true, underline: true, size: 14, name: "Calibri" };

    // -- Row 39: Disclaimer text (tall) ----------------------------------------
    ws.getRow(39).height = 318;
    ws.mergeCells(39, 2, 39, 9);
    const discBody = ws.getCell(39, 2);
    discBody.value =
      `This Report is published by Sunidhi Securities & Finance Limited (hereinafter referred to as "Sunidhi") SEBI Research Analyst Registration Number: INH000000000 for private circulation. Sunidhi is a registered Stock Broker with National Stock Exchange of India Limited, BSE Limited and Metropolitan Stock Exchange of India Limited in cash, derivatives and currency derivatives segments. It is also having registration as a Depository Participant with CDSL.\n\n` +
      `Sunidhi has other business divisions with independent research teams separated by Chinese walls, and therefore may, at times, have different or contrary views on stocks and markets.\n\n` +
      `Sunidhi or its associates has not been debarred / suspended by SEBI or any other regulatory authority for accessing / dealing in securities Market. Sunidhi or analyst or his relatives do not hold any financial interest in the subject company. Associates may have such interest in its ordinary course of business as a distinct and independent body. Sunidhi or its associates or Analyst do not have any conflict or material conflict of interest at the time of publication of the research report with the company covered by Analyst.\n\n` +
      `Sunidhi or its associates / analyst has not received any compensation / managed or co-managed public offering of securities of the company covered by Analyst during the past twelve months. Sunidhi or its associates has not received any compensation or other benefits from the company covered by Analyst or third party in connection with the research report. Analyst has not served as an officer, director or employee of subject company and Sunidhi / analyst has not been engaged in market making activity of the subject company.\n\n` +
      `Analyst or his relatives do not hold beneficial ownership of 1% or more in the subject company at the end of the month immediately preceding the date of publication of this research report. Sunidhi or its associates may have investment positions in the stocks recommended in this report, which may have beneficial ownership of 1% or more in the subject company at the end of the month immediately preceding the date of publication of this research report. However, Sunidhi is maintaining Chinese wall between other business divisions or activities. Analyst has exercised due diligence in checking correctness of details and opinion expressed herein is unbiased.\n\n` +
      `This report is meant for personal informational purposes and is not be construed as a solicitation or financial advice or an offer to buy or sell any securities or related financial instruments. While utmost care has been taken in preparing this report, we claim no responsibility for its accuracy. Recipients should not regard the report as a substitute for the exercise of their own judgment. Any opinions expressed in this report are subject to change without any notice and this report is not under any obligation to update or keep current the information contained herein. Past performance is not necessarily indicative of future results. This report accepts no liability whatsoever for any loss or damage of any kind arising out of the use of all or any part of this report.\n\n` +
      `Each recipient of this document should make such investigations as they deem necessary to arrive at an independent evaluation of an investment in the securities of the companies referred to in this document (including the merits and risks involved), and should consult their own advisors to determine the merits and risks of such an investment.\n\n` +
      `The information in this document has been printed on the basis of publicly available information, internal data and other reliable sources believed to be true, but we do not represent that it is accurate or complete and it should not be relied on as such, as this document is for general guidance only. Sunidhi or any of its affiliates/ group companies shall not be in any way responsible for any loss or damage that may arise to any person from any inadvertent error in the information contained in this report. Sunidhi has not independently verified all the information contained within this document. Accordingly, we cannot testify, nor make any representation or warranty, express or implied, to the accuracy, contents or data contained within this document. While Sunidhi endeavors to update on a reasonable basis the information discussed in this material, there may be regulatory, compliance, or other reasons that prevent us from doing so. Neither Sunidhi nor its directors, employees or affiliates shall be liable for any loss or damage that may arise from or in connection with the use of this information.`;
    discBody.font = { name: "Calibri", size: 8, color: { argb: C.black } };
    discBody.alignment = { wrapText: true, vertical: "top" };

    boxBorder(ws, 38, 2, 39, 9);
    hRule(ws, 38, 2, 9);

    // -- Row 40: Company footer -------------------------------------------------
    ws.getRow(40).height = 18.6;
    ws.mergeCells(40, 2, 40, 9);
    const footerCell = ws.getCell(40, 2);
    footerCell.value = "Sunidhi Securities & Finance Ltd. - Research Analyst - INH000000000";
    footerCell.font = { bold: true, name: "Calibri", size: 9 };
    footerCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // -- Row 41: Address --------------------------------------------------------
    ws.getRow(41).height = 20.4;
    ws.mergeCells(41, 2, 41, 9);
    const addrCell = ws.getCell(41, 2);
    addrCell.value = "Registered office address (configure via MTF_COMPLIANCE_ADDRESS)";
    addrCell.font = { name: "Calibri", size: 9 };
    addrCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // -- Rows 42-44: Registration table ------------------------------------------
    const REG_ROWS: Array<[number, [number, number, string][]]> = [
      [42, [[2, 3, "Bombay Stock Exchange (BSE)"],
            [4, 6, "National Stock Exchange of India Ltd (NSE)"],
            [7, 9, "Metropolitan Stock Exchange of India Limited (MSEI)"]]],
      [43, [[2, 3, "Registration no. INZ000000000"],
            [4, 6, "Registration no. INZ000000000"],
            [7, 9, "Registration no. INZ000000000"]]],
      [44, [[2, 3, "Compliance Officer Name:"],
            [4, 6, "Compliance Officer Name"],
            [7, 9, "Phone No: +91-00000-00000"]]],
    ];

    for (const [row, cols] of REG_ROWS) {
      for (const [c1, c2, text] of cols) {
        if (c1 !== c2) ws.mergeCells(row, c1, row, c2);
        const cell = ws.getCell(row, c1);
        cell.value = text;
        cell.font = { name: "Calibri", size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    }

    boxBorder(ws, 40, 2, 44, 9);
    hRule(ws, 40, 2, 9);
    hRule(ws, 41, 2, 9);
    for (let r = 42; r <= 44; r++) {
      ws.getCell(r, 4).border = { ...ws.getCell(r, 4).border, left: THIN };
      ws.getCell(r, 7).border = { ...ws.getCell(r, 7).border, left: THIN };
      if (r < 44) hRule(ws, r, 2, 9);
    }

    // -- Serialize --------------------------------------------------------------
    const buf = await wb.xlsx.writeBuffer();

    const dateSuffix = today
      .toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" })
      .replace(/\//g, ".");

    return new NextResponse(buf as unknown as BodyInit, {
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
