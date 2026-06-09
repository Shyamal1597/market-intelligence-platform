// lib/flow-periods.ts
//
// Period helpers for FII/DII flow aggregation.
// All math is done on local-time year-month strings -- no toISOString() round-trips
// (which silently shift dates back a day in IST due to UTC conversion).

import type { FiiDiiEntry } from "./nse-flows";

/** Local "YYYY-MM" of a Date. */
export function localYearMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Indian Financial Year start month, "YYYY-MM".
 * FY runs Apr 1 → Mar 31. Apr-Dec → FY started Apr of current calendar year;
 * Jan-Mar → FY started Apr of previous calendar year.
 */
export function fyStartMonth(d: Date): string {
  const m = d.getMonth(); // 0-11
  const yearOfFyStart = m >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${yearOfFyStart}-04`;
}

/**
 * FY-aligned quarter start month, "YYYY-MM".
 * Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar.
 */
export function fyQuarterStartMonth(d: Date): string {
  const m = d.getMonth(); // 0-11
  let qStartMonth: number;
  const qYear = d.getFullYear();
  if      (m >= 3 && m <= 5)  qStartMonth = 3;  // Q1
  else if (m >= 6 && m <= 8)  qStartMonth = 6;  // Q2
  else if (m >= 9 && m <= 11) qStartMonth = 9;  // Q3
  else                        qStartMonth = 0;  // Q4 (Jan-Mar of same calendar year)
  const mm = String(qStartMonth + 1).padStart(2, "0");
  return `${qYear}-${mm}`;
}

/** Short FY label, e.g. "FY27" for fiscal year ending March 2027. */
export function fyLabel(d: Date): string {
  const fyEndYear = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(fyEndYear).slice(-2)}`;
}

export interface PeriodTotals {
  mtd: number;
  qtd: number;
  ytd: number;
  fyLabel: string;
  startOfMonth: string;
  startOfQuarter: string;
  startOfFy: string;
}

/**
 * Sum FII equity net flows for the three standard periods, anchored at `today`.
 *   MTD: current calendar month (e.g. "2026-04")
 *   QTD: FY quarter (e.g. Q1 = Apr-Jun → starts "2026-04")
 *   YTD: FY year (e.g. FY27 starts "2026-04")
 */
export function computePeriodTotals(entries: FiiDiiEntry[], today: Date = new Date()): PeriodTotals {
  const startOfMonth   = localYearMonth(today);
  const startOfQuarter = fyQuarterStartMonth(today);
  const startOfFy      = fyStartMonth(today);

  const sumFrom = (fromYm: string) =>
    entries.filter((e) => e.date.slice(0, 7) >= fromYm).reduce((s, e) => s + e.fiiEquityNet, 0);

  return {
    mtd: sumFrom(startOfMonth),
    qtd: sumFrom(startOfQuarter),
    ytd: sumFrom(startOfFy),
    fyLabel: fyLabel(today),
    startOfMonth,
    startOfQuarter,
    startOfFy,
  };
}
