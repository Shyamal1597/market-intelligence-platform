/**
 * All derived MTF metrics (% change, rankings, turnover-share) computed here
 * on read from mtf_daily -- nothing derived is stored, so logic can change
 * without re-ingesting.
 *
 * This page is used by the retail desk and is intentionally independent of
 * the research-coverage universe (SYMBOL_SECTOR / the Concall Guidance
 * Tracker) -- a different department uses that data for a different
 * purpose. Do not reintroduce a coverage/sector cross-reference here.
 *
 * Sector grouping (getSectorBreakdown, below) uses a SEPARATE, real
 * exchange-sourced classification (lib/mtf/sector.ts, built by
 * scripts/mtf-build-sector-cache.ts from NSE/BSE data) that covers the full
 * MTF universe -- not SYMBOL_SECTOR, which only tags the ~100 covered stocks.
 */
import { getMtfDb } from "./db";
import { getSectorMap } from "./sector";

export interface SymbolSnapshot {
  symbol: string;
  name: string | null;
  amtToday: number | null;
  amtYesterday: number | null;
  amtChangePct: number | null;
  priceToday: number | null;
  priceYesterday: number | null;
  priceChangePct: number | null;
  turnoverLakhs: number | null;
  turnoverFinancedPct: number | null;
  /** See isNavPegged() below. */
  isNavPegged: boolean;
}

function pctChange(today: number | null, yesterday: number | null): number | null {
  if (today === null || yesterday === null || yesterday === 0) return null;
  return ((today - yesterday) / Math.abs(yesterday)) * 100;
}

/**
 * A single-day PRICE move beyond this is virtually never organic trading --
 * NSE circuit bands are typically 5/10/20%. It almost always means a stock
 * split, bonus issue, or (for ETFs) a unit split happened between the two
 * days. BOTH stored closes are genuinely real, exchange-reported prices --
 * this is NOT bad data -- but comparing them directly is misleading, since
 * our feed carries unadjusted closes (no split-adjustment), unlike a
 * charting platform that retroactively rescales history across a split.
 * Confirmed against real data (2026-07-15): PSUBANK (Kotak Nifty PSU Bank
 * ETF) genuinely traded at Rs 822.75 close on 2026-07-09 and Rs 85.31 close
 * on 2026-07-10 -- BSE's own bhavcopy for the 10th shows the day's full
 * O/H/L/C already on the new ~85 scale (open 83.97, high 94.4, low 82.75),
 * consistent with a ~10x unit split, while PREV_CLOSE for that day still
 * carries the old scale. A naive % change across that boundary reads as a
 * fake "-89.6% crash" that never happened to any holder's actual position
 * value. Reporting it as unknown (null) rather than a real number keeps
 * that split-boundary artifact out of movers/divergence/drilldown, which
 * all read priceChangePct as a trading signal.
 * (MTF-financed amount is NOT capped this way -- large swings there are
 * real and expected off a small base; see MATERIALITY_FLOOR_LAKHS instead.)
 */
const MAX_PLAUSIBLE_PRICE_CHANGE_PCT = 50;

function priceChangePct(today: number | null, yesterday: number | null): number | null {
  const pct = pctChange(today, yesterday);
  if (pct !== null && Math.abs(pct) > MAX_PLAUSIBLE_PRICE_CHANGE_PCT) return null;
  return pct;
}

/**
 * Below this MTF-financed amount, a day-over-day % change is statistical
 * noise, not a real signal -- e.g. a liquid/money-market ETF whose book
 * moves from Rs 5L to Rs 59L reads as "+1038%" but is an economically
 * trivial amount, not a leverage story. ETFs and liquid funds trade under
 * the same BSE "EQ" series as real companies (confirmed against real data,
 * 2026-07-13), so series can't distinguish them -- an absolute floor on the
 * financed amount is the reliable filter regardless of *why* the base is
 * tiny (thinly-traded fund, illiquid small-cap, or a data blip).
 * Rs 100 Lakhs (Rs 1 Cr) excludes the bottom ~25% of the universe by book
 * size while keeping every symbol with a genuinely material MTF position.
 */
const MATERIALITY_FLOOR_LAKHS = 100;

function isMaterial(r: SymbolSnapshot): boolean {
  return (r.amtToday ?? 0) >= MATERIALITY_FLOOR_LAKHS;
}

/**
 * Liquid/money-market ETFs (LIQUIDBEES, LIQUID, ...) settle at a near-fixed
 * NAV (~Rs 1000) by design -- their book can be large and genuinely material,
 * but the "price" never moves, so they're not a leverage/momentum story a
 * trader can act on and just add visual noise to movers/heatmap/leaderboard.
 * Detected from today's own OHLC spread rather than a symbol allowlist,
 * since new NAV-pegged instruments get added over time: if a day's full
 * high-low range is under 0.3% of the close, the instrument didn't really
 * trade that day (confirmed against real data 2026-07-14: LIQUIDBEES/LIQUID
 * sit at ~0.01-0.08%, vs 0.6-9%+ for real equities like RELIANCE/RPGLIFE).
 */
const NAV_PEG_RANGE_PCT = 0.3;

function computeIsNavPegged(high: number | null, low: number | null, close: number | null): boolean {
  if (high === null || low === null || !close) return false;
  return ((high - low) / close) * 100 < NAV_PEG_RANGE_PCT;
}

/** Movers/heatmap/leaderboard should only surface stocks with a material AND real (non-NAV-pegged) book. */
function isTradeable(r: SymbolSnapshot): boolean {
  return isMaterial(r) && !r.isNavPegged;
}

/** The two most recent distinct dates in the table, newest first. */
export async function getLatestTwoDates(): Promise<{ latest: string | null; previous: string | null }> {
  const db = await getMtfDb();
  const rows = db.prepare(
    "SELECT DISTINCT date FROM mtf_daily ORDER BY date DESC LIMIT 2",
  ).all() as { date: string }[];
  return { latest: rows[0]?.date ?? null, previous: rows[1]?.date ?? null };
}

/** Every symbol's today-vs-yesterday snapshot, with derived % changes. Full universe, always. */
export async function getSnapshot(): Promise<{
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

  const rows: SymbolSnapshot[] = today.map((t) => {
    const y = yestBySymbol.get(t.symbol);
    const turnoverFinancedPct =
      t.turnover_lakhs && t.turnover_lakhs > 0 && t.amt_financed_lakhs !== null
        ? (t.amt_financed_lakhs / t.turnover_lakhs) * 100
        : null;
    return {
      symbol: t.symbol,
      name: t.name,
      amtToday: t.amt_financed_lakhs,
      amtYesterday: y?.amt_financed_lakhs ?? null,
      amtChangePct: pctChange(t.amt_financed_lakhs, y?.amt_financed_lakhs ?? null),
      priceToday: t.close,
      priceYesterday: y?.close ?? null,
      priceChangePct: priceChangePct(t.close, y?.close ?? null),
      turnoverLakhs: t.turnover_lakhs,
      turnoverFinancedPct,
      isNavPegged: computeIsNavPegged(t.high, t.low, t.close),
    };
  });

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
  /** Sum(amtToday) / Sum(turnoverLakhs) -- book-weighted. */
  aggregateTurnoverFinancedPct: number | null;
  /** Simple mean of each symbol's turnoverFinancedPct -- unweighted, shows typical symbol not the book. */
  avgTurnoverFinancedPct: number | null;
}

export async function getBreadth(): Promise<Breadth> {
  const { date, previousDate, rows } = await getSnapshot();
  const totalAmtToday = rows.reduce((s, r) => s + (r.amtToday ?? 0), 0);
  const totalAmtYesterday = previousDate
    ? rows.reduce((s, r) => s + (r.amtYesterday ?? 0), 0)
    : null;
  const totalTurnover = rows.reduce((s, r) => s + (r.turnoverLakhs ?? 0), 0);

  const financedPcts = rows
    .map((r) => r.turnoverFinancedPct)
    .filter((v): v is number => v !== null);
  const avgTurnoverFinancedPct = financedPcts.length > 0
    ? financedPcts.reduce((s, v) => s + v, 0) / financedPcts.length
    : null;

  return {
    date, previousDate,
    totalAmtToday, totalAmtYesterday,
    countUp: rows.filter((r) => (r.amtChangePct ?? 0) > 0).length,
    countDown: rows.filter((r) => (r.amtChangePct ?? 0) < 0).length,
    countFlat: rows.filter((r) => r.amtChangePct === 0).length,
    totalSymbols: rows.length,
    aggregateTurnoverFinancedPct: totalTurnover > 0 ? (totalAmtToday / totalTurnover) * 100 : null,
    avgTurnoverFinancedPct,
  };
}

/**
 * The exact symbol list behind a getBreadth() count -- same predicate, same
 * full (unfiltered) universe, so "893" on the tile and the length of this
 * list always match. Sorted so the most extreme movers surface first for
 * up/down; "flat" has nothing to rank by change, so it sorts by book size.
 */
export async function getBreadthSymbols(direction: "up" | "down" | "flat"): Promise<SymbolSnapshot[]> {
  const { rows } = await getSnapshot();
  const filtered = direction === "up"
    ? rows.filter((r) => (r.amtChangePct ?? 0) > 0)
    : direction === "down"
      ? rows.filter((r) => (r.amtChangePct ?? 0) < 0)
      : rows.filter((r) => r.amtChangePct === 0);

  return filtered.sort((a, b) => {
    if (direction === "up") return (b.amtChangePct ?? 0) - (a.amtChangePct ?? 0);
    if (direction === "down") return (a.amtChangePct ?? 0) - (b.amtChangePct ?? 0);
    return (b.amtToday ?? 0) - (a.amtToday ?? 0);
  });
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
  direction: "up" | "down", limit = 50,
): Promise<{ date: string | null; previousDate: string | null; rows: MoverRow[] }> {
  const { date, previousDate, rows } = await getSnapshot();
  const filtered = rows
    .filter((r) => isTradeable(r) && r.amtChangePct !== null && (direction === "up" ? r.amtChangePct > 0 : r.amtChangePct < 0))
    .sort((a, b) =>
      direction === "up"
        ? (b.amtChangePct ?? 0) - (a.amtChangePct ?? 0)
        : (a.amtChangePct ?? 0) - (b.amtChangePct ?? 0),
    )
    .slice(0, limit);
  return { date, previousDate, rows: await attachSparklines(filtered) };
}

export interface HeatmapNode {
  symbol: string;
  name: string | null;
  /** Sizing value for the treemap box -- today's MTF-financed amount, Rs Lakhs. */
  amtToday: number;
  /** Coloring value -- day-over-day % change in financed amount. */
  amtChangePct: number | null;
  priceChangePct: number | null;
  turnoverLakhs: number | null;
}

/**
 * Top N most materially-financed stocks, for the leverage heatmap (treemap):
 * box size = how much money is actually financed (materiality/attention-
 * worthiness), box color = today's leverage direction/magnitude. Limited to
 * a bounded top-N (by book size) rather than the whole ~2000-symbol universe
 * so the chart stays legible -- a treemap with thousands of slivers is as
 * unreadable as a scatter plot crushed by outliers.
 */
export async function getLeverageHeatmap(limit = 120): Promise<{
  date: string | null; nodes: HeatmapNode[];
}> {
  const { date, rows } = await getSnapshot();
  const nodes = rows
    .filter((r) => isTradeable(r))
    .sort((a, b) => (b.amtToday ?? 0) - (a.amtToday ?? 0))
    .slice(0, limit)
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      amtToday: r.amtToday as number,
      amtChangePct: r.amtChangePct,
      priceChangePct: r.priceChangePct,
      turnoverLakhs: r.turnoverLakhs,
    }));
  return { date, nodes };
}

export async function getTurnoverLeaders(
  limit = 50,
): Promise<{ date: string | null; rows: SymbolSnapshot[] }> {
  const { date, rows } = await getSnapshot();
  const sorted = rows
    .filter((r) => isTradeable(r) && r.turnoverFinancedPct !== null)
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

export interface SectorBreakdownRow {
  sector: string;
  amtToday: number;
  amtYesterday: number;
  amtChangePct: number | null;
  symbolCount: number;
}

/**
 * Total MTF-financed book grouped by real exchange sector -- "which sectors
 * is leverage money flowing into/out of." Uses lib/mtf/sector.ts (BSE-
 * sourced, covers the full MTF universe), NOT the research-coverage
 * SYMBOL_SECTOR map. Symbols we couldn't resolve a sector for are counted
 * in unclassifiedAmt/unclassifiedCount rather than silently dropped, so the
 * numbers always foot to the same total as the rest of the dashboard.
 */
export async function getSectorBreakdown(): Promise<{
  date: string | null;
  rows: SectorBreakdownRow[];
  unclassifiedAmt: number;
  unclassifiedCount: number;
}> {
  const { date, rows } = await getSnapshot();
  const sectorMap = getSectorMap();
  const bySector = new Map<string, { amtToday: number; amtYesterday: number; symbolCount: number }>();
  let unclassifiedAmt = 0;
  let unclassifiedCount = 0;

  for (const r of rows) {
    if (!isTradeable(r)) continue;
    const info = sectorMap[r.symbol];
    if (!info) {
      unclassifiedAmt += r.amtToday ?? 0;
      unclassifiedCount++;
      continue;
    }
    const bucket = bySector.get(info.sector) ?? { amtToday: 0, amtYesterday: 0, symbolCount: 0 };
    bucket.amtToday += r.amtToday ?? 0;
    bucket.amtYesterday += r.amtYesterday ?? 0;
    bucket.symbolCount++;
    bySector.set(info.sector, bucket);
  }

  const sectorRows: SectorBreakdownRow[] = Array.from(bySector.entries())
    .map(([sector, v]) => ({
      sector,
      amtToday: v.amtToday,
      amtYesterday: v.amtYesterday,
      amtChangePct: v.amtYesterday > 0 ? ((v.amtToday - v.amtYesterday) / v.amtYesterday) * 100 : null,
      symbolCount: v.symbolCount,
    }))
    .sort((a, b) => b.amtToday - a.amtToday);

  return { date, rows: sectorRows, unclassifiedAmt, unclassifiedCount };
}

/**
 * The exact symbol list behind one getSectorBreakdown() bar (or the
 * "Unclassified" bucket, passed as sector === "Unclassified") -- same
 * isTradeable filter and sector lookup, so the bar's book size and this
 * list's total always tie out. Sorted by today's financed amount, largest
 * first, matching the bar's own "biggest contributors" framing.
 */
export async function getSectorSymbols(sector: string): Promise<SymbolSnapshot[]> {
  const { rows } = await getSnapshot();
  const sectorMap = getSectorMap();
  const filtered = rows.filter((r) => {
    if (!isTradeable(r)) return false;
    const info = sectorMap[r.symbol];
    return sector === "Unclassified" ? !info : info?.sector === sector;
  });
  return filtered.sort((a, b) => (b.amtToday ?? 0) - (a.amtToday ?? 0));
}

export interface DivergenceRow {
  symbol: string;
  name: string | null;
  amtChangePct: number;
  priceChangePct: number;
  amtToday: number | null;
  pattern: "leverage-up-price-down" | "leverage-down-price-up";
}

/**
 * Below this combined |amtChangePct| + |priceChangePct| gap, an opposite-
 * sign move is routine noise, not a real divergence -- confirmed against
 * real data (2026-07-15): the median gap across every sign-mismatched
 * symbol is ~3%, and 57% of the whole universe has SOME sign mismatch on
 * any given day. Requiring >=8% (roughly the 85th percentile of the gap
 * distribution) keeps this list to the genuinely notable cases.
 */
const MIN_DIVERGENCE_GAP_PCT = 8;

/**
 * Symbols where margin financing and price moved in OPPOSITE directions
 * today -- a signal the plain movers table (sorted by amt change alone)
 * won't surface on its own. "Leverage up, price down" flags margin being
 * added against a falling stock (unwind risk if the fall continues);
 * "leverage down, price up" flags margin being pulled from a rising stock.
 */
export async function getDivergence(limit = 30): Promise<{ date: string | null; rows: DivergenceRow[] }> {
  const { date, rows } = await getSnapshot();
  const divergent = rows
    .filter((r): r is SymbolSnapshot & { amtChangePct: number; priceChangePct: number } =>
      isTradeable(r) && r.amtChangePct !== null && r.priceChangePct !== null &&
      Math.sign(r.amtChangePct) !== 0 && Math.sign(r.priceChangePct) !== 0 &&
      Math.sign(r.amtChangePct) !== Math.sign(r.priceChangePct))
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      amtChangePct: r.amtChangePct,
      priceChangePct: r.priceChangePct,
      amtToday: r.amtToday,
      gap: Math.abs(r.amtChangePct) + Math.abs(r.priceChangePct),
      pattern: (r.amtChangePct > 0 ? "leverage-up-price-down" : "leverage-down-price-up") as DivergenceRow["pattern"],
    }))
    .filter((r) => r.gap >= MIN_DIVERGENCE_GAP_PCT)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
    .map(({ gap: _gap, ...rest }) => rest);

  return { date, rows: divergent };
}

export interface IngestVerification {
  date: string;
  previousDate: string | null;
  totalAmtToday: number;
  totalAmtPrevious: number | null;
  bookChangePct: number | null;
  /** True if the WHOLE-universe book moved implausibly for a single day -- almost
   * certainly a parsing bug (e.g. a decimal shift or misaligned column), not real
   * market activity, since ~2000 symbols' idiosyncratic moves should average out. */
  bookChangeIsImplausible: boolean;
  symbolCountToday: number;
  newSymbolCount: number;
  vanishedSymbolCount: number;
  vanishedSymbols: string[];
  priceGuardTriggeredCount: number;
  priceGuardTriggeredSymbols: string[];
}

/**
 * A whole-universe book swing beyond this in one day is well outside anything
 * seen in real data -- every observed day-over-day change across the dataset
 * so far (2026-06-25 through 2026-07-10) has been under 1%, since ~2000
 * symbols' independent moves average out. 15% leaves a wide margin above
 * that while still catching the kind of error a broken parse would produce
 * (e.g. a whole sheet's amounts read in the wrong units).
 */
const MAX_PLAUSIBLE_BOOK_CHANGE_PCT = 15;

/**
 * Sanity-checks a just-ingested date against the one before it: does the
 * total book move by a plausible amount, did a suspicious chunk of symbols
 * vanish, how many hit the corporate-action price guard. Surfaced in the
 * upload UI so whoever uploads the file gets a concrete signal the parse
 * looks right, not just "no error was thrown."
 */
export async function getIngestVerification(date: string): Promise<IngestVerification> {
  const db = await getMtfDb();
  const dates = (db.prepare(
    "SELECT DISTINCT date FROM mtf_daily WHERE date <= ? ORDER BY date DESC LIMIT 2",
  ).all(date) as { date: string }[]);
  const previousDate = dates[1]?.date ?? null;

  type Row = { symbol: string; amt_financed_lakhs: number | null; close: number | null };
  const today = db.prepare(
    "SELECT symbol, amt_financed_lakhs, close FROM mtf_daily WHERE date = ?",
  ).all(date) as Row[];
  const todayBySymbol = new Map(today.map((r) => [r.symbol, r]));
  const totalAmtToday = today.reduce((s, r) => s + (r.amt_financed_lakhs ?? 0), 0);

  let totalAmtPrevious: number | null = null;
  let bookChangePct: number | null = null;
  let newSymbolCount = today.length;
  let vanishedSymbolCount = 0;
  let vanishedSymbols: string[] = [];
  let priceGuardTriggeredCount = 0;
  const priceGuardTriggeredSymbols: string[] = [];

  if (previousDate) {
    const prev = db.prepare(
      "SELECT symbol, amt_financed_lakhs, close FROM mtf_daily WHERE date = ?",
    ).all(previousDate) as Row[];
    const prevBySymbol = new Map(prev.map((r) => [r.symbol, r]));
    totalAmtPrevious = prev.reduce((s, r) => s + (r.amt_financed_lakhs ?? 0), 0);
    bookChangePct = totalAmtPrevious > 0 ? ((totalAmtToday - totalAmtPrevious) / totalAmtPrevious) * 100 : null;

    newSymbolCount = today.filter((r) => !prevBySymbol.has(r.symbol)).length;
    const vanished = prev.filter((r) => !todayBySymbol.has(r.symbol));
    vanishedSymbolCount = vanished.length;
    vanishedSymbols = vanished.slice(0, 10).map((r) => r.symbol);

    for (const r of today) {
      const p = prevBySymbol.get(r.symbol);
      if (p?.close && r.close) {
        const pct = Math.abs(((r.close - p.close) / p.close) * 100);
        if (pct > MAX_PLAUSIBLE_PRICE_CHANGE_PCT) {
          priceGuardTriggeredCount++;
          if (priceGuardTriggeredSymbols.length < 10) priceGuardTriggeredSymbols.push(r.symbol);
        }
      }
    }
  }

  return {
    date,
    previousDate,
    totalAmtToday,
    totalAmtPrevious,
    bookChangePct,
    bookChangeIsImplausible: bookChangePct !== null && Math.abs(bookChangePct) > MAX_PLAUSIBLE_BOOK_CHANGE_PCT,
    symbolCountToday: today.length,
    newSymbolCount,
    vanishedSymbolCount,
    vanishedSymbols,
    priceGuardTriggeredCount,
    priceGuardTriggeredSymbols,
  };
}

export interface ContinuousFunderRow {
  symbol: string;
  name: string | null;
  cont: number;
  amtChangePct: number;
  priceChangePct: number | null;
  amtToday: number | null;
  sparkline: number[];
}

const MIN_CONT = 4;

/**
 * Symbols flagged by the report's own "MTF DATA POSITIVE"/"MTF DATA
 * NEGATIVE" sheets with cont >= 4 (see parseMoverSheet in lib/mtf/ingest.ts
 * for exactly what "cont" means -- a frequency count over the report's own
 * trailing window, not a streak). Sourced directly from that sheet per
 * explicit instruction, rather than derived from our own accumulated
 * upload history; our own mtf_daily history is still used for the trend
 * sparkline, and priceChangePct/amtChangePct still come from our own
 * snapshot (same split-guarded, day-over-day methodology as every other
 * panel), so only the "which stocks qualify" part changed.
 */
export async function getContinuousFunders(
  direction: "up" | "down", minCont = MIN_CONT, limit = 50,
): Promise<{ date: string | null; rows: ContinuousFunderRow[] }> {
  const { date, rows: snapshotRows } = await getSnapshot();
  if (!date) return { date: null, rows: [] };

  const bySnapshot = new Map(snapshotRows.map((r) => [r.symbol, r]));

  const db = await getMtfDb();
  const contRows = db.prepare(
    "SELECT symbol, cont, latest_pct_chg FROM mtf_mover_cont WHERE date = ? AND direction = ? AND cont >= ?",
  ).all(date, direction, minCont) as { symbol: string; cont: number; latest_pct_chg: number | null }[];

  if (contRows.length === 0) return { date, rows: [] };

  const symbols = contRows.map((r) => r.symbol);
  const placeholders = symbols.map(() => "?").join(",");
  const history = db.prepare(
    `SELECT symbol, date, amt_financed_lakhs FROM mtf_daily WHERE symbol IN (${placeholders}) ORDER BY date ASC`,
  ).all(...symbols) as { symbol: string; date: string; amt_financed_lakhs: number | null }[];
  const sparkBySymbol = new Map<string, number[]>();
  for (const h of history) {
    const arr = sparkBySymbol.get(h.symbol) ?? [];
    if (h.amt_financed_lakhs != null) arr.push(h.amt_financed_lakhs);
    sparkBySymbol.set(h.symbol, arr);
  }

  const results: ContinuousFunderRow[] = [];
  for (const r of contRows) {
    const snap = bySnapshot.get(r.symbol);
    if (!snap || !isTradeable(snap)) continue;
    results.push({
      symbol: r.symbol,
      name: snap.name,
      cont: r.cont,
      amtChangePct: snap.amtChangePct ?? r.latest_pct_chg ?? 0,
      priceChangePct: snap.priceChangePct,
      amtToday: snap.amtToday,
      sparkline: sparkBySymbol.get(r.symbol) ?? [],
    });
  }

  results.sort((a, b) => b.cont - a.cont || Math.abs(b.amtChangePct) - Math.abs(a.amtChangePct));
  return { date, rows: results.slice(0, limit) };
}
