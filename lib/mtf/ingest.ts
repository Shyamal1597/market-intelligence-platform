/**
 * Parses a Margin Trading Volume Wise Report .xls (legacy BIFF format) and
 * upserts it into mtf_daily. Trade date comes from BHAVCOPY's DATE1 column,
 * not the filename (a human types the filename by hand).
 *
 * Note: BHAVCOPY's header names and DATE1 values both carry a leading space
 * (" SERIES", " 03-Jul-2026") -- trim everything defensively.
 */
import * as XLSX from "@e965/xlsx";
import { getMtfDb, type MtfDailyRow } from "./db";

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "03-Jul-2026" (with or without surrounding whitespace) -> "2026-07-03" */
function parseBhavDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

interface MoverContRow { symbol: string; cont: number; latestPctChg: number | null; }

/**
 * The "MTF TRADING" sheet's Amt Fin column is read by fixed column position
 * (index 3), never by a hardcoded unit assumption -- its header text has
 * changed from "...Rs. In Lakhs)" to "...Rs. In Cr)" before without the
 * column moving, and every other part of this codebase (mtf_daily's
 * amt_financed_lakhs column, every %-change/turnover-ratio/materiality-floor
 * calculation in lib/mtf/queries.ts, both the dashboard and the PDF export)
 * assumes the stored value is in Lakhs. Silently trusting the raw number
 * when the source has switched to Cr would understate every financed amount
 * in the system by 100x -- the highest-severity kind of data error, since it
 * feeds both the live dashboard and the client-facing PDF. Detected from the
 * header text every ingest, factor applied before storage, and refuses to
 * guess (throws) if the header doesn't clearly say one or the other.
 */
export function detectAmtFinancedUnitFactor(headerText: string): { factor: number; label: string } {
  const h = headerText.toLowerCase();
  if (/\bcr\b|\bcrore/.test(h)) return { factor: 100, label: "Crores" };
  if (/\blakh/.test(h)) return { factor: 1, label: "Lakhs" };
  throw new Error(
    `Cannot determine the unit of the "MTF TRADING" sheet's Amt Fin column from its header ` +
    `("${headerText}") -- expected it to mention "Lakhs" or "Cr"/"Crore". Refusing to guess, since ` +
    `misreading the unit would silently misstate every financed amount in the system by 100x.`,
  );
}

/**
 * "MTF DATA POSITIVE"/"MTF DATA NEGATIVE" sheets, Volume Movers panel only
 * (cols A-M; the Price Mover panel starting at col O is a separate ranking
 * we don't need -- price change is already tracked from BHAVCOPY). Row
 * layout: Symbol, Cont., %Change, <date value>, %Change, <date value>, ...
 * repeating across a trailing ~5-day window, ending with a base value.
 *
 * "Cont." is NOT a consecutive streak -- confirmed against real data
 * (2026-07-16): it's the report's own count of positive (POSITIVE sheet) or
 * negative (NEGATIVE sheet) day-over-day changes across that window. A
 * stock with +,-,-,+,+ gets cont=3 in POSITIVE and cont=2 in NEGATIVE
 * simultaneously, which a true streak could never produce for the same day.
 * %Change is stored as a fraction (0.284 = 28.4%) in the sheet; converted
 * to a plain percentage here to match every other %change field in this app.
 */
function parseMoverSheet(sheet: XLSX.WorkSheet | undefined): MoverContRow[] {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }).slice(2);
  const out: MoverContRow[] = [];
  for (const row of rows) {
    const symbol = String(row[0] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const cont = num(row[1]);
    if (cont === null) continue;
    const latestPct = num(row[2]);
    out.push({ symbol, cont, latestPctChg: latestPct !== null ? latestPct * 100 : null });
  }
  return out;
}

export interface IngestSummary {
  date: string | null;
  rowsIngested: number;
  mtfRowCount: number;
  bhavRowCount: number;
  symbolsInMtfNotBhav: string[];
  warnings: string[];
}

export async function ingestMtfWorkbook(buffer: Buffer): Promise<IngestSummary> {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer" });

  const mtfSheet = wb.Sheets["MTF TRADING"];
  const bhavSheet = wb.Sheets["BHAVCOPY"];
  if (!mtfSheet) throw new Error('Sheet "MTF TRADING" not found in workbook.');
  if (!bhavSheet) throw new Error('Sheet "BHAVCOPY" not found in workbook.');

  const mtfRowsRaw = XLSX.utils.sheet_to_json<unknown[]>(mtfSheet, { header: 1 });
  const mtfHeader = mtfRowsRaw[0] ?? [];
  const mtfRows = mtfRowsRaw.slice(1);
  const bhavRows = XLSX.utils.sheet_to_json<unknown[]>(bhavSheet, { header: 1 }).slice(1);

  if (mtfRows.length === 0) throw new Error('"MTF TRADING" sheet has no data rows.');
  if (bhavRows.length === 0) throw new Error('"BHAVCOPY" sheet has no data rows.');

  const amtFinancedHeaderText = String(mtfHeader[3] ?? "");
  const { factor: amtUnitFactor, label: amtUnitLabel } = detectAmtFinancedUnitFactor(amtFinancedHeaderText);
  // Only surface this when a conversion actually happened -- the routine Lakhs
  // case is the expected default and shouldn't add an amber "warning" box to
  // every single upload, but a Cr-sourced file changing every stored figure
  // by 100x is exactly the kind of thing the uploader should see confirmed.
  if (amtUnitFactor !== 1) {
    warnings.push(`Amt Fin column read as ${amtUnitLabel} -- converted x${amtUnitFactor} to Lakhs for storage.`);
  }

  // Build BHAVCOPY lookup keyed by symbol, across all series.
  //
  // Verified against all 6 real sample files: every symbol appears at most
  // once in BHAVCOPY regardless of series (zero collisions across ~3,300
  // rows/file), so there is no ambiguity in dropping the series filter.
  // Restricting to SERIES === "EQ" (as originally drafted) turned out to be
  // wrong against real data -- roughly 130-145 MTF TRADING symbols per file
  // trade under SERIES "BE" (trade-to-trade) or "BZ", not "EQ", and were
  // being reported as "missing from BHAVCOPY" when they were present all
  // along. With the filter removed, only 8-10 genuinely absent symbols
  // remain per file (real suspensions/no-trade days), matching the "handful"
  // the task expected. GS (government securities) rows are harmless to
  // include since they never share a symbol with MTF TRADING in practice.
  const bhavBySymbol = new Map<string, unknown[]>();
  let tradeDate: string | null = null;
  for (const row of bhavRows) {
    const symbol = String(row[0] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    bhavBySymbol.set(symbol, row);
    if (!tradeDate) {
      const d = parseBhavDate(row[2]);
      if (d) tradeDate = d;
    }
  }

  if (bhavBySymbol.size === 0) {
    throw new Error("BHAVCOPY sheet had no rows with a parseable symbol.");
  }

  if (!tradeDate) {
    throw new Error("Could not parse a trade date from BHAVCOPY's DATE1 column.");
  }

  const symbolsInMtfNotBhav: string[] = [];
  const dbRowsBySymbol = new Map<string, MtfDailyRow>();
  const duplicateSymbols: string[] = [];

  for (const row of mtfRows) {
    const symbol = String(row[0] ?? "").trim().toUpperCase();
    // Skip blank rows and the trailing "* Figures are rounded..." disclaimer
    // row every sample file ends with -- it has text in column 0 but is not
    // a real symbol.
    if (!symbol || symbol.startsWith("*")) continue;
    const name = String(row[1] ?? "").trim() || null;
    const qtyFinanced = num(row[2]);
    const amtFinancedRaw = num(row[3]);
    const amtFinanced = amtFinancedRaw !== null ? amtFinancedRaw * amtUnitFactor : null;

    const bhav = bhavBySymbol.get(symbol);
    if (!bhav) {
      symbolsInMtfNotBhav.push(symbol);
    }

    if (dbRowsBySymbol.has(symbol)) {
      duplicateSymbols.push(symbol);
    }

    dbRowsBySymbol.set(symbol, {
      date: tradeDate,
      symbol,
      name,
      qty_financed: qtyFinanced,
      amt_financed_lakhs: amtFinanced,
      open: bhav ? num(bhav[4]) : null,
      high: bhav ? num(bhav[5]) : null,
      low: bhav ? num(bhav[6]) : null,
      close: bhav ? num(bhav[8]) : null,
      prev_close: bhav ? num(bhav[3]) : null,
      volume: bhav ? num(bhav[10]) : null,
      turnover_lakhs: bhav ? num(bhav[11]) : null,
      trades: bhav ? num(bhav[12]) : null,
      deliv_qty: bhav ? num(bhav[13]) : null,
      deliv_pct: bhav ? num(bhav[14]) : null,
    });
  }

  const dbRows: MtfDailyRow[] = Array.from(dbRowsBySymbol.values());

  if (duplicateSymbols.length > 0) {
    warnings.push(
      `${duplicateSymbols.length} duplicate symbol(s) in MTF TRADING (last occurrence wins): ` +
      duplicateSymbols.slice(0, 10).join(", ") +
      (duplicateSymbols.length > 10 ? ", ..." : ""),
    );
  }

  if (symbolsInMtfNotBhav.length > 0) {
    warnings.push(
      `${symbolsInMtfNotBhav.length} symbol(s) in MTF TRADING had no matching BHAVCOPY row: ` +
      symbolsInMtfNotBhav.slice(0, 10).join(", ") +
      (symbolsInMtfNotBhav.length > 10 ? ", ..." : ""),
    );
  }

  const db = await getMtfDb();
  const upsert = db.prepare(`
    INSERT INTO mtf_daily (date, symbol, name, qty_financed, amt_financed_lakhs,
      open, high, low, close, prev_close, volume, turnover_lakhs, trades, deliv_qty, deliv_pct)
    VALUES (@date, @symbol, @name, @qty_financed, @amt_financed_lakhs,
      @open, @high, @low, @close, @prev_close, @volume, @turnover_lakhs, @trades, @deliv_qty, @deliv_pct)
    ON CONFLICT(date, symbol) DO UPDATE SET
      name = excluded.name,
      qty_financed = excluded.qty_financed,
      amt_financed_lakhs = excluded.amt_financed_lakhs,
      open = excluded.open, high = excluded.high, low = excluded.low,
      close = excluded.close, prev_close = excluded.prev_close,
      volume = excluded.volume, turnover_lakhs = excluded.turnover_lakhs,
      trades = excluded.trades, deliv_qty = excluded.deliv_qty, deliv_pct = excluded.deliv_pct
  `);

  const upsertAll = db.transaction((rows: MtfDailyRow[]) => {
    for (const r of rows) upsert.run(r);
  });
  upsertAll(dbRows);

  // "MTF DATA POSITIVE"/"MTF DATA NEGATIVE" -- optional, not every file has
  // them (e.g. a partial/incomplete day's file may only have these two
  // sheets and lack MTF TRADING/BHAVCOPY entirely, which fails ingestion
  // above before we'd ever reach here; conversely some files have MTF
  // TRADING/BHAVCOPY but skip these). Non-fatal either way.
  const positiveRows = parseMoverSheet(wb.Sheets["MTF DATA POSITIVE"]);
  const negativeRows = parseMoverSheet(wb.Sheets["MTF DATA NEGATIVE"]);

  if (positiveRows.length > 0 || negativeRows.length > 0) {
    const upsertCont = db.prepare(`
      INSERT INTO mtf_mover_cont (date, symbol, direction, cont, latest_pct_chg)
      VALUES (@date, @symbol, @direction, @cont, @latest_pct_chg)
      ON CONFLICT(date, symbol, direction) DO UPDATE SET
        cont = excluded.cont, latest_pct_chg = excluded.latest_pct_chg
    `);
    const upsertContAll = db.transaction((rows: (MoverContRow & { direction: "up" | "down" })[]) => {
      for (const r of rows) {
        upsertCont.run({
          date: tradeDate, symbol: r.symbol, direction: r.direction,
          cont: r.cont, latest_pct_chg: r.latestPctChg,
        });
      }
    });
    upsertContAll([
      ...positiveRows.map((r) => ({ ...r, direction: "up" as const })),
      ...negativeRows.map((r) => ({ ...r, direction: "down" as const })),
    ]);
  } else {
    warnings.push('"MTF DATA POSITIVE"/"MTF DATA NEGATIVE" sheets not found or empty -- continuous-funding data not updated for this date.');
  }

  return {
    date: tradeDate,
    rowsIngested: dbRows.length,
    mtfRowCount: mtfRows.length,
    bhavRowCount: bhavRows.length,
    symbolsInMtfNotBhav,
    warnings,
  };
}
