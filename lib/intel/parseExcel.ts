// Bloomberg/CIQ Excel → Fundamentals JSON.
//
// Bloomberg layout assumption:
//   - Header rows in the top ~10 rows of each sheet
//   - Column A may hold Bloomberg field codes ("SALES_REV_TURN/10^6")
//   - Column B (or C) holds human labels ("Revenue", "Net Interest Margin")
//   - One header row contains period dates ("2024-12-31") OR Bloomberg labels ("FQ3 2026")
//   - Values in millions are divided by 10 to get crores (Bloomberg /10^6 → Cr)

import * as XLSX from "xlsx";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type { Fundamentals, QuarterFundamentals, SectorRegistry } from "./types";
import { dateToQuarter, bloombergFqToQuarter } from "./quarters";

export interface RowHit {
  rowIndex: number;
  label: string;
  values: (number | null)[];
}

const MAX_HEADER_SCAN_ROWS = 12;

/** Find the first row whose label cell (col B or C) contains any needle (case-insensitive substring). */
export function findRow(ws: XLSX.WorkSheet, needles: string[]): RowHit | null {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 0; r <= range.e.r; r++) {
    for (const labelCol of [1, 2]) { // B then C
      const cell = ws[XLSX.utils.encode_cell({ r, c: labelCol })];
      const label = cell?.v != null ? String(cell.v) : "";
      if (!label) continue;
      const ll = label.toLowerCase();
      if (needles.some((n) => ll.includes(n.toLowerCase()))) {
        const values: (number | null)[] = [];
        for (let c = 0; c <= range.e.c; c++) {
          const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
          values.push(typeof v === "number" && Number.isFinite(v) ? v : null);
        }
        return { rowIndex: r, label, values };
      }
    }
  }
  return null;
}

/** Scan top rows for a header line with period dates or Bloomberg FQ labels.
 *  Returns map: quarterLabel → column index. */
export function buildQuarterIndex(ws: XLSX.WorkSheet): Record<string, number> {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const out: Record<string, number> = {};
  for (let r = 0; r <= Math.min(MAX_HEADER_SCAN_ROWS, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (v == null) continue;
      if (v instanceof Date) {
        const iso = v.toISOString().slice(0, 10);
        const q = dateToQuarter(iso);
        if (!(q in out)) out[q] = c;
        continue;
      }
      const s = String(v);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const q = dateToQuarter(`${m[1]}-${m[2]}-${m[3]}`);
        if (!(q in out)) out[q] = c;
        continue;
      }
      const fq = bloombergFqToQuarter(s);
      if (fq && !(fq in out)) out[fq] = c;
    }
  }
  return out;
}

/** Parse a Bloomberg/CIQ Excel workbook into a Fundamentals object. */
export async function parseExcel(opts: {
  symbol: string;
  ticker: string;
  xlsxPath: string;
  registry: SectorRegistry;
}): Promise<Fundamentals> {
  const wb = XLSX.readFile(opts.xlsxPath);
  const warnings: string[] = [];
  const quarters: { [q: string]: QuarterFundamentals } = {};

  const qIndexCache: Record<string, Record<string, number>> = {};
  function getQIndex(sheetName: string) {
    if (!qIndexCache[sheetName]) {
      const ws = wb.Sheets[sheetName];
      qIndexCache[sheetName] = ws ? buildQuarterIndex(ws) : {};
    }
    return qIndexCache[sheetName];
  }

  for (const m of opts.registry.metrics) {
    const ws = wb.Sheets[m.excel.sheet];
    if (!ws) {
      warnings.push(`${m.key}: sheet "${m.excel.sheet}" not found`);
      continue;
    }
    const hit = findRow(ws, m.excel.rowLabelMatch);
    if (!hit) {
      warnings.push(`${m.key}: no row matching ${JSON.stringify(m.excel.rowLabelMatch)} in sheet "${m.excel.sheet}"`);
      continue;
    }
    const qIdx = getQIndex(m.excel.sheet);
    for (const [q, col] of Object.entries(qIdx)) {
      let v = hit.values[col];
      if (v == null) continue;
      // Bloomberg field codes ending in "/10^6" mean value is in millions → divide by 10 for crores
      const fieldCode = ws[XLSX.utils.encode_cell({ r: hit.rowIndex, c: 0 })]?.v;
      if (typeof fieldCode === "string" && /\/10\^6$/.test(fieldCode)) {
        v = v / 10;
      }
      // Ratios reported as fractions (e.g. 0.998) → convert to percent when unit is %
      if (m.unit === "%" && typeof v === "number" && Math.abs(v) < 5 && /\/100$/.test(String(fieldCode ?? ""))) {
        v = v * 100;
      }
      // Round to 4 significant decimal places to strip SheetJS floating-point noise
      v = Math.round(v * 10000) / 10000;
      if (!quarters[q]) quarters[q] = { endDate: "", metrics: {} };
      quarters[q].metrics[m.key] = v;
    }
  }

  // Derive endDate from quarter label where not already set
  for (const q of Object.keys(quarters)) {
    if (!quarters[q].endDate) {
      const qm = q.match(/^Q([1-4])-FY(\d{2})$/);
      if (qm) {
        const qi = parseInt(qm[1]);
        const fyEndYear = 2000 + parseInt(qm[2]);
        const monthEnd = qi === 1 ? "06-30" : qi === 2 ? "09-30" : qi === 3 ? "12-31" : "03-31";
        const yearEnd = qi === 4 ? fyEndYear : fyEndYear - 1;
        quarters[q].endDate = `${yearEnd}-${monthEnd}`;
      }
    }
  }

  return { symbol: opts.symbol, ticker: opts.ticker, unit: "Cr", quarters, warnings };
}

/** Stable hash of a Fundamentals object for cache invalidation. */
export function fundamentalsHash(f: Fundamentals): string {
  return crypto.createHash("sha256").update(JSON.stringify(f.quarters)).digest("hex").slice(0, 16);
}

/** Persist a Fundamentals JSON to disk (atomic write via tmp rename). */
export async function writeFundamentals(symbol: string, f: Fundamentals): Promise<string> {
  const dir = path.join(process.cwd(), "data", "intelligence", symbol);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "fundamentals.json");
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(f, null, 2), "utf-8");
  await fs.rename(tmp, file);
  return file;
}
