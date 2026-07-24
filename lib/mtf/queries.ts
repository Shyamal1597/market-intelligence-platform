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
  /** Today's delivered value in Lakhs -- deliv_qty (shares actually delivered,
   * from BHAVCOPY) x close price. An approximation (close, not a true
   * volume-weighted average delivery price -- BHAVCOPY doesn't carry that),
   * but close is what's already stored for every date, so this works for the
   * full history immediately rather than only from whenever a new column
   * would start being populated. */
  deliveryValueLakhs: number | null;
  /** BHAVCOPY's own DELIV_PER -- % of today's traded quantity that was
   * delivered (settled as real ownership) rather than squared off intraday.
   * Used for the "Avg Delivery %" breadth tile, a market-wide gauge of
   * whether today's activity reflects genuine conviction or speculative
   * churn -- distinct from anything MTF-book-based. */
  deliveryPct: number | null;
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

/**
 * Trade-to-Trade (T2T) symbols settle under compulsory delivery -- every
 * trade must be delivered, no intraday squaring off -- and are structurally
 * ineligible for margin trading. Any MTF amount attributed to one is not
 * real financing (most likely a stale/leftover entry from before a T2T
 * reclassification, or the source feed including a symbol the exchange
 * itself doesn't allow MTF on).
 *
 * Originally detected via "today's delivery % >= 100", on the assumption
 * that compulsory-delivery symbols would report 100% delivery. That was
 * wrong: real data shows BE/BZ-series (T2T) rows report DELIV_QTY/DELIV_PER
 * as blank ("-"), not literally 100 -- e.g. MTARTECH, series " BE", reports
 * deliv_pct as null on every date checked, so the >=100 check silently let
 * it (and every other T2T row with blank delivery data) straight through.
 * The 8-of-2,146 "hits" the old check found on 2026-07-21 were a handful of
 * illiquid EQ-series ETFs that coincidentally traded 100% delivery that one
 * day -- not T2T stocks at all.
 *
 * BHAVCOPY's own SERIES column is the exchange's actual classification and
 * doesn't have this ambiguity: confirmed against all 9 available raw source
 * files (2026-06-25 through 2026-07-10), SERIES "BE" or "BZ" identifies
 * 114-153 of the ~2,150 "MTF TRADING" symbols per file (the same
 * bhav-lookup fix in ingest.ts already found this independently -- see its
 * comment on dropping the EQ-only join filter).
 */
const T2T_SERIES = new Set(["BE", "BZ"]);

/**
 * Fallback for dates ingested before the `series` column existed (2026-07-13
 * through 2026-07-21): the raw upload isn't retained after ingestion (see
 * app/api/mtf/upload/route.ts), so those rows' true series can't be
 * recovered and `series` is null for them. This is the union of every
 * BE/BZ symbol observed across all 9 raw files still on disk -- used only
 * when a row's own `series` is unavailable. T2T membership does shift over
 * time, so this is an approximation for that gap window, not a permanent
 * substitute -- every date ingested from here on stores its own real
 * series and never needs this list.
 */
const KNOWN_T2T_SYMBOLS = new Set([
  "AARTECH", "AFFORDABLE", "AFIL", "AGL", "AMANTA", "APTECHT", "ARROWGREEN",
  "ASMS", "AUTOIND", "AVADHSUGAR", "AVG", "BALAXI", "BASML", "BGRENERGY",
  "BHAGERIA", "BHARATGEAR", "BIRLACABLE", "BLACKROSE", "BLISSGVS", "BODALCHEM",
  "BSHSL", "BYKE", "CHEMBOND", "CHEMCON", "CHEMFAB", "COFFEEDAY", "CORDSCABLE",
  "CPCAP", "CYBERTECH", "DBEIL", "DBOL", "DBREALTY", "DCI", "DEEDEV",
  "DELPHIFX", "DISHTV", "DPSCLTD", "DPWIRES", "ECOSMOBLTY", "EIFFL", "EMMBI",
  "ESSENTIA", "EVERESTIND", "FAIRCHEMOR", "FCSSOFT", "FOCUS", "GAUDIUMIVF",
  "GINNIFILA", "GLOBECIVIL", "GLOTTIS", "GOLDTECH", "GUJENERGY", "GULFPETRO",
  "HALDYNGL", "HILINFRA", "HILTON", "IBULLSLTD", "IDEAFORGE", "IFBAGRO",
  "INDOAMIN", "INDOTECH", "INDOWIND", "JAIBALAJI", "JKIPL", "KAMDHENU",
  "KANORICHEM", "KECL", "KHADIM", "KHAICHEM", "KILITCH", "KOPRAN", "KOTYARK",
  "KRITI", "KRITINUT", "KRN", "LAXMIINDIA", "LIKHITHA", "LOKESHMACH",
  "LYKALABS", "MANORG", "MAWANASUG", "MAZDA", "MBLINFRA", "MCLEODRUSS",
  "MEIL", "MENONBE", "MGEL", "MICEL", "MODISONLTD", "MTARTECH", "NAGAFERT",
  "NAHARSPING", "NECLIFE", "NOVAAGRI", "NRL", "OCCLLTD", "OILCOUNTUB",
  "OMFREIGHT", "ONIDA", "ONMOBILE", "ORBTEXP", "OSWALAGRO", "PARSVNATH",
  "PASUPTAC", "PAVNAIND", "PENINLAND", "PFOCUS", "PLAZACABLE", "PPL",
  "PRADPME", "PREMIERPOL", "PRITIKAUTO", "QPOWER", "QUICKHEAL", "RAJESHEXPO",
  "RAJOOENG", "RAMASTEEL", "REGAAL", "RELINFRA", "RSWM", "RUBYMILLS",
  "SAKUMA", "SARVESHWAR", "SHIVALIK", "SIGACHI", "SIGMAADV", "STERTOOLS",
  "STLNETWORK", "STLTECH", "STYLEBAAZA", "SUBEXLTD", "SUMIT", "SUTLEJTEX",
  "SYSTMTXC", "TAKE", "TIGERLOGS", "TIRUPATIFL", "TRANSWORLD", "UNIDT",
  "UNIVASTU", "VALIANTLAB", "VALIANTORG", "VARDHACRLC", "VASCONEQ",
  "VENUSREM", "VETO", "VIKRAMSOLR", "VIPCLOTHNG", "VMSTMT", "VPRPL",
  "ZEELEARN", "ZIMLAB", "ZODIAC",
]);

function isTradeToTrade(series: string | null, symbol: string): boolean {
  if (series) return T2T_SERIES.has(series);
  return KNOWN_T2T_SYMBOLS.has(symbol);
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
  const todayRaw = db.prepare("SELECT * FROM mtf_daily WHERE date = ?").all(latest) as any[];
  const today = todayRaw.filter((t) => !isTradeToTrade(t.series, t.symbol));
  const yestBySymbol = new Map<string, any>();
  if (previous) {
    for (const r of db.prepare("SELECT * FROM mtf_daily WHERE date = ?").all(previous) as any[]) {
      yestBySymbol.set(r.symbol, r);
    }
  }

  const rows: SymbolSnapshot[] = today.map((t) => {
    const y = yestBySymbol.get(t.symbol);
    const deliveryValueLakhs =
      t.deliv_qty && t.deliv_qty > 0 && t.close && t.close > 0
        ? (t.deliv_qty * t.close) / 100000
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
      deliveryValueLakhs,
      deliveryPct: t.deliv_pct,
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
  /**
   * (Sum(amtToday) - Sum(amtYesterday)) / Sum(deliveryValueLakhs) -- the
   * WHOLE universe's net GAIN/LOSS in MTF book today, relative to today's
   * total delivery value. A FLOW metric (day's change), not a level ratio --
   * signed, can be negative on a day the book shrank. Answers "how much of
   * today's real (delivered) trading value does today's net financing swing
   * represent" -- distinct from turnoverFinancedPct-style ratios, which
   * compare an accumulated book LEVEL against a single day's volume and are
   * always positive. Replaced the original level-ratio design
   * (aggregateTurnoverFinancedPct, then briefly a delivery-value level
   * ratio) per explicit correction.
   */
  aggregateDeliveryFinancedPct: number | null;
  /**
   * Mean of deliveryPct (BHAVCOPY's own DELIV_PER) across isTradeable
   * symbols -- how much of today's activity was genuine delivery-based
   * conviction rather than speculative/intraday churn. Genuinely distinct
   * from every other tile here (none of them look at price/volume quality,
   * only MTF-book levels or flows) -- a simple mean is statistically safe
   * for this one, unlike the old turnover-ratio tile it replaced: deliv_pct
   * is naturally bounded 0-100, so there's no unbounded-outlier risk the way
   * an unbounded book/turnover ratio had.
   */
  avgDeliveryPct: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export async function getBreadth(): Promise<Breadth> {
  const { date, previousDate, rows } = await getSnapshot();
  const totalAmtToday = rows.reduce((s, r) => s + (r.amtToday ?? 0), 0);
  const totalAmtYesterday = previousDate
    ? rows.reduce((s, r) => s + (r.amtYesterday ?? 0), 0)
    : null;
  const totalDeliveryValue = rows.reduce((s, r) => s + (r.deliveryValueLakhs ?? 0), 0);

  // isTradeable-filtered so this isn't skewed by immaterial or NAV-pegged
  // noise -- matches every other "typical stock" panel (Movers/Heatmap/
  // Divergence).
  const deliveryPcts = rows
    .filter((r) => isTradeable(r))
    .map((r) => r.deliveryPct)
    .filter((v): v is number => v !== null);

  return {
    date, previousDate,
    totalAmtToday, totalAmtYesterday,
    countUp: rows.filter((r) => (r.amtChangePct ?? 0) > 0).length,
    countDown: rows.filter((r) => (r.amtChangePct ?? 0) < 0).length,
    // "?? 0" (not a strict "=== 0"): amtChangePct is null both for a genuinely
    // new symbol (no prior-day baseline) and for a 0-Lakh book that stayed at
    // 0-Lakh (pctChange's divide-by-zero guard can't compute 0/0, even though
    // "stayed at zero" is unambiguously a flat/unchanged case, not unknown).
    // A strict "=== 0" check drops both kinds of null-amtChangePct symbol from
    // every bucket -- confirmed against real data: countUp+countDown+countFlat
    // undercounted totalSymbols by exactly the count of null-amtChangePct
    // rows (8 of 2142 on 2026-07-20). Folding them into "flat" keeps
    // up+down+flat === totalSymbols always true, and there's no separate
    // "new symbol" bucket in the UI for the rare genuinely-new case to go to.
    countFlat: rows.filter((r) => (r.amtChangePct ?? 0) === 0).length,
    totalSymbols: rows.length,
    aggregateDeliveryFinancedPct:
      totalDeliveryValue > 0 && totalAmtYesterday !== null
        ? ((totalAmtToday - totalAmtYesterday) / totalDeliveryValue) * 100
        : null,
    avgDeliveryPct: mean(deliveryPcts),
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
      // "?? 0" here too -- must match getBreadth()'s countFlat predicate
      // exactly, or the tile's count and this list's length would disagree
      // again for the same null-amtChangePct rows (see countFlat's comment).
      : rows.filter((r) => (r.amtChangePct ?? 0) === 0);

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

export interface SymbolHistoryPoint {
  date: string;
  /** Day-over-day CHANGE in qty_financed (shares currently financed on
   * margin), NOT the outstanding balance itself -- signed, can be negative.
   * The raw feed's "Qty Fin by all the members" is a cumulative book figure
   * (confirmed against real data: it moves smoothly day-to-day like a
   * balance, e.g. INGERRAND 6207 -> 6238 -> 6397 -> 6339 ..., not an
   * erratic same-day count like deliv_qty), so there is no genuine
   * "shares financed today" figure in the source -- this delta is the
   * closest real "for the day" quantity: how many shares were added to
   * (positive) or removed from (negative) the margin book that day. */
  mtfVolumeChange: number | null;
  close: number | null;
  /** BHAVCOPY's own DELIV_QTY for this date -- shares actually delivered
   * that day, a genuine same-day flow (unlike mtfVolumeChange's book-delta
   * derivation, deliv_qty needs no transformation). Raw share count, not a
   * Rupee value, so it's directly comparable to mtfVolumeChange on one axis. */
  deliveryVolume: number | null;
}

/** Drilldown shows a short recent window, not the symbol's entire ingested
 * history -- per explicit instruction, the last 6 trading sessions. */
const SYMBOL_HISTORY_SESSIONS = 6;

export async function getSymbolHistory(symbol: string): Promise<SymbolHistoryPoint[]> {
  const db = await getMtfDb();
  // Fetch one extra session before the displayed window purely as the
  // baseline to diff the first displayed day's qty_financed against.
  const rows = db.prepare(
    `SELECT date, qty_financed, close, deliv_qty FROM (
       SELECT date, qty_financed, close, deliv_qty FROM mtf_daily
       WHERE symbol = ? ORDER BY date DESC LIMIT ?
     ) ORDER BY date ASC`,
  ).all(symbol.toUpperCase(), SYMBOL_HISTORY_SESSIONS + 1) as { date: string; qty_financed: number | null; close: number | null; deliv_qty: number | null }[];

  const points: SymbolHistoryPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const today = rows[i];
    const prevQty = rows[i - 1].qty_financed;
    const mtfVolumeChange =
      today.qty_financed !== null && prevQty !== null ? today.qty_financed - prevQty : null;
    points.push({
      date: today.date,
      mtfVolumeChange,
      close: today.close,
      deliveryVolume: today.deliv_qty,
    });
  }
  return points;
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
 * in unclassifiedAmt/unclassifiedCount rather than silently dropped.
 *
 * This panel (like Movers/Heatmap/Divergence) only includes isTradeable
 * symbols, whereas "Total MTF Book" on the breadth tiles sums the WHOLE
 * universe -- so the two totals don't foot to each other by design.
 * Confirmed against real data (2026-07-20): whole-universe book was
 * Rs 135,984.97 Cr across 2,142 symbols; this panel's rows + unclassified
 * sum to Rs 135,821.95 Cr across 1,592 symbols, a Rs 163.02 Cr / 550-symbol
 * gap from the same materiality-floor/NAV-peg exclusion used everywhere
 * else. excludedAmt/excludedCount surface that gap explicitly so it's
 * disclosed rather than silently unexplained.
 */
export async function getSectorBreakdown(): Promise<{
  date: string | null;
  rows: SectorBreakdownRow[];
  unclassifiedAmt: number;
  unclassifiedCount: number;
  excludedAmt: number;
  excludedCount: number;
}> {
  const { date, rows } = await getSnapshot();
  const sectorMap = getSectorMap();
  const bySector = new Map<string, { amtToday: number; amtYesterday: number; symbolCount: number }>();
  let unclassifiedAmt = 0;
  let unclassifiedCount = 0;
  let excludedAmt = 0;
  let excludedCount = 0;

  for (const r of rows) {
    if (!isTradeable(r)) {
      excludedAmt += r.amtToday ?? 0;
      excludedCount++;
      continue;
    }
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

  return { date, rows: sectorRows, unclassifiedAmt, unclassifiedCount, excludedAmt, excludedCount };
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
  /** The SAME row's own price-persistence count from the report's "Margin
   * Trading Price Mover" block -- independent of "cont" above. Confirmed
   * against real data (2026-07-20): CEATLTD had cont=5/5 (financing built
   * every day) while priceCont was only 2/5 (price rarely followed). Null
   * only if the report's Price Mover block was missing/unparseable for
   * this row. */
  priceCont: number | null;
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
    "SELECT symbol, cont, latest_pct_chg, price_cont FROM mtf_mover_cont WHERE date = ? AND direction = ? AND cont >= ?",
  ).all(date, direction, minCont) as { symbol: string; cont: number; latest_pct_chg: number | null; price_cont: number | null }[];

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
      priceCont: r.price_cont,
      amtChangePct: snap.amtChangePct ?? r.latest_pct_chg ?? 0,
      priceChangePct: snap.priceChangePct,
      amtToday: snap.amtToday,
      sparkline: sparkBySymbol.get(r.symbol) ?? [],
    });
  }

  results.sort((a, b) => b.cont - a.cont || Math.abs(b.amtChangePct) - Math.abs(a.amtChangePct));
  return { date, rows: results.slice(0, limit) };
}

export interface PriceMoverRow {
  symbol: string;
  name: string | null;
  /** The ranking dimension for this card -- price-persistence count from the
   * report's own "Margin Trading Price Mover" block. */
  priceCont: number;
  /** The SAME row's MTF-financing persistence count, shown for cross-
   * reference against the Volume Movers card -- independent of priceCont. */
  cont: number | null;
  amtChangePct: number | null;
  priceChangePct: number | null;
  amtToday: number | null;
  priceToday: number | null;
  /** Close-price history, not financed-amount -- this card is about price
   * persistence, so the trend sparkline should show price, not the book. */
  sparkline: number[];
}

/**
 * Symmetric counterpart to getContinuousFunders, ranked by the report's
 * Price Mover persistence count instead of its Volume Mover one. Reuses the
 * exact same already-ingested mtf_mover_cont rows -- direction "up" reads
 * the POSITIVE sheet's price_cont (days price rose), "down" reads the
 * NEGATIVE sheet's price_cont (days price fell), matching how the vendor's
 * own sheet split works for the MTF side.
 */
export async function getPriceMovers(
  direction: "up" | "down", minCont = MIN_CONT, limit = 50,
): Promise<{ date: string | null; rows: PriceMoverRow[] }> {
  const { date, rows: snapshotRows } = await getSnapshot();
  if (!date) return { date: null, rows: [] };

  const bySnapshot = new Map(snapshotRows.map((r) => [r.symbol, r]));

  const db = await getMtfDb();
  const contRows = db.prepare(
    "SELECT symbol, cont, price_cont FROM mtf_mover_cont WHERE date = ? AND direction = ? AND price_cont >= ?",
  ).all(date, direction, minCont) as { symbol: string; cont: number; price_cont: number | null }[];

  if (contRows.length === 0) return { date, rows: [] };

  const symbols = contRows.map((r) => r.symbol);
  const placeholders = symbols.map(() => "?").join(",");
  const history = db.prepare(
    `SELECT symbol, date, close FROM mtf_daily WHERE symbol IN (${placeholders}) ORDER BY date ASC`,
  ).all(...symbols) as { symbol: string; date: string; close: number | null }[];
  const sparkBySymbol = new Map<string, number[]>();
  for (const h of history) {
    const arr = sparkBySymbol.get(h.symbol) ?? [];
    if (h.close != null) arr.push(h.close);
    sparkBySymbol.set(h.symbol, arr);
  }

  const results: PriceMoverRow[] = [];
  for (const r of contRows) {
    if (r.price_cont === null) continue;
    const snap = bySnapshot.get(r.symbol);
    if (!snap || !isTradeable(snap)) continue;
    results.push({
      symbol: r.symbol,
      name: snap.name,
      priceCont: r.price_cont,
      cont: r.cont,
      amtChangePct: snap.amtChangePct,
      priceChangePct: snap.priceChangePct,
      amtToday: snap.amtToday,
      priceToday: snap.priceToday,
      sparkline: sparkBySymbol.get(r.symbol) ?? [],
    });
  }

  results.sort((a, b) => b.priceCont - a.priceCont || Math.abs(b.priceChangePct ?? 0) - Math.abs(a.priceChangePct ?? 0));
  return { date, rows: results.slice(0, limit) };
}
