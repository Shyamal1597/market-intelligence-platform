/**
 * All derived MTF metrics (% change, rankings, turnover-share) computed here
 * on read from mtf_daily -- nothing derived is stored, so logic can change
 * without re-ingesting.
 */
import { getMtfDb } from "./db";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

export interface SymbolSnapshot {
  symbol: string;
  name: string | null;
  sector: string | null;
  isCoverage: boolean;
  amtToday: number | null;
  amtYesterday: number | null;
  amtChangePct: number | null;
  priceToday: number | null;
  priceYesterday: number | null;
  priceChangePct: number | null;
  turnoverLakhs: number | null;
  turnoverFinancedPct: number | null;
}

function pctChange(today: number | null, yesterday: number | null): number | null {
  if (today === null || yesterday === null || yesterday === 0) return null;
  return ((today - yesterday) / Math.abs(yesterday)) * 100;
}

/** The two most recent distinct dates in the table, newest first. */
export async function getLatestTwoDates(): Promise<{ latest: string | null; previous: string | null }> {
  const db = await getMtfDb();
  const rows = db.prepare(
    "SELECT DISTINCT date FROM mtf_daily ORDER BY date DESC LIMIT 2",
  ).all() as { date: string }[];
  return { latest: rows[0]?.date ?? null, previous: rows[1]?.date ?? null };
}

/** Every symbol's today-vs-yesterday snapshot, with derived % changes. */
export async function getSnapshot(scope: "all" | "coverage"): Promise<{
  date: string | null; previousDate: string | null; rows: SymbolSnapshot[];
}> {
  const { latest, previous } = await getLatestTwoDates();
  if (!latest) return { date: null, previousDate: null, rows: [] };

  const db = await getMtfDb();
  const today = db.prepare("SELECT * FROM mtf_daily WHERE date = ?").all(latest) as any[];
  const yestBySymbol = new Map<string, any>();
  if (previous) {
    for (const r of db.prepare("SELECT * FROM mtf_daily WHERE date = ?").all(previous) as any[]) {
      yestBySymbol.set(r.symbol, r);
    }
  }

  let rows: SymbolSnapshot[] = today.map((t) => {
    const y = yestBySymbol.get(t.symbol);
    const turnoverFinancedPct =
      t.turnover_lakhs && t.turnover_lakhs > 0 && t.amt_financed_lakhs !== null
        ? (t.amt_financed_lakhs / t.turnover_lakhs) * 100
        : null;
    return {
      symbol: t.symbol,
      name: t.name,
      sector: SYMBOL_SECTOR[t.symbol] ?? null,
      isCoverage: Boolean(SYMBOL_SECTOR[t.symbol]),
      amtToday: t.amt_financed_lakhs,
      amtYesterday: y?.amt_financed_lakhs ?? null,
      amtChangePct: pctChange(t.amt_financed_lakhs, y?.amt_financed_lakhs ?? null),
      priceToday: t.close,
      priceYesterday: y?.close ?? null,
      priceChangePct: pctChange(t.close, y?.close ?? null),
      turnoverLakhs: t.turnover_lakhs,
      turnoverFinancedPct,
    };
  });

  if (scope === "coverage") rows = rows.filter((r) => r.isCoverage);
  return { date: latest, previousDate: previous, rows };
}

export interface Breadth {
  date: string | null;
  previousDate: string | null;
  totalAmtToday: number;
  totalAmtYesterday: number | null;
  countUp: number;
  countDown: number;
  countFlat: number;
  totalSymbols: number;
  aggregateTurnoverFinancedPct: number | null;
}

export async function getBreadth(scope: "all" | "coverage"): Promise<Breadth> {
  const { date, previousDate, rows } = await getSnapshot(scope);
  const totalAmtToday = rows.reduce((s, r) => s + (r.amtToday ?? 0), 0);
  const totalAmtYesterday = previousDate
    ? rows.reduce((s, r) => s + (r.amtYesterday ?? 0), 0)
    : null;
  const totalTurnover = rows.reduce((s, r) => s + (r.turnoverLakhs ?? 0), 0);
  return {
    date, previousDate,
    totalAmtToday, totalAmtYesterday,
    countUp: rows.filter((r) => (r.amtChangePct ?? 0) > 0).length,
    countDown: rows.filter((r) => (r.amtChangePct ?? 0) < 0).length,
    countFlat: rows.filter((r) => r.amtChangePct === 0).length,
    totalSymbols: rows.length,
    aggregateTurnoverFinancedPct: totalTurnover > 0 ? (totalAmtToday / totalTurnover) * 100 : null,
  };
}

export interface MoverRow extends SymbolSnapshot {
  sparkline: number[];
}

async function attachSparklines(rows: SymbolSnapshot[]): Promise<MoverRow[]> {
  if (rows.length === 0) return [];
  const db = await getMtfDb();
  const symbols = rows.map((r) => r.symbol);
  const placeholders = symbols.map(() => "?").join(",");
  const history = db.prepare(
    `SELECT symbol, date, amt_financed_lakhs FROM mtf_daily WHERE symbol IN (${placeholders}) ORDER BY date ASC`,
  ).all(...symbols) as { symbol: string; date: string; amt_financed_lakhs: number | null }[];

  const bySymbol = new Map<string, number[]>();
  for (const h of history) {
    const arr = bySymbol.get(h.symbol) ?? [];
    if (h.amt_financed_lakhs !== null) arr.push(h.amt_financed_lakhs);
    bySymbol.set(h.symbol, arr);
  }
  return rows.map((r) => ({ ...r, sparkline: bySymbol.get(r.symbol) ?? [] }));
}

export async function getMovers(
  scope: "all" | "coverage", direction: "up" | "down", limit = 50,
): Promise<{ date: string | null; previousDate: string | null; rows: MoverRow[] }> {
  const { date, previousDate, rows } = await getSnapshot(scope);
  const filtered = rows
    .filter((r) => r.amtChangePct !== null && (direction === "up" ? r.amtChangePct > 0 : r.amtChangePct < 0))
    .sort((a, b) =>
      direction === "up"
        ? (b.amtChangePct ?? 0) - (a.amtChangePct ?? 0)
        : (a.amtChangePct ?? 0) - (b.amtChangePct ?? 0),
    )
    .slice(0, limit);
  return { date, previousDate, rows: await attachSparklines(filtered) };
}

export async function getQuadrant(scope: "all" | "coverage"): Promise<{
  date: string | null; points: { symbol: string; priceChangePct: number; amtChangePct: number; isCoverage: boolean }[];
}> {
  const { date, rows } = await getSnapshot(scope);
  const points = rows
    .filter((r) => r.priceChangePct !== null && r.amtChangePct !== null)
    .map((r) => ({
      symbol: r.symbol,
      priceChangePct: r.priceChangePct as number,
      amtChangePct: r.amtChangePct as number,
      isCoverage: r.isCoverage,
    }));
  return { date, points };
}

export async function getTurnoverLeaders(
  scope: "all" | "coverage", limit = 50,
): Promise<{ date: string | null; rows: SymbolSnapshot[] }> {
  const { date, rows } = await getSnapshot(scope);
  const sorted = rows
    .filter((r) => r.turnoverFinancedPct !== null)
    .sort((a, b) => (b.turnoverFinancedPct ?? 0) - (a.turnoverFinancedPct ?? 0))
    .slice(0, limit);
  return { date, rows: sorted };
}

export interface SymbolHistoryPoint { date: string; amtFinancedLakhs: number | null; close: number | null; }

export async function getSymbolHistory(symbol: string): Promise<SymbolHistoryPoint[]> {
  const db = await getMtfDb();
  const rows = db.prepare(
    "SELECT date, amt_financed_lakhs, close FROM mtf_daily WHERE symbol = ? ORDER BY date ASC",
  ).all(symbol.toUpperCase()) as { date: string; amt_financed_lakhs: number | null; close: number | null }[];
  return rows.map((r) => ({ date: r.date, amtFinancedLakhs: r.amt_financed_lakhs, close: r.close }));
}
