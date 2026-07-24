/**
 * SQLite database singleton for the Margin Trading (MTF) tracker.
 * Mirrors lib/db.ts's pattern (better-sqlite3, WAL mode).
 *
 * One row per (date, symbol). Everything derived (day-over-day % change,
 * rankings, turnover-share) is computed on read in lib/mtf/queries.ts, not
 * stored here -- keeps ingestion dumb and correct.
 */
import Database from "better-sqlite3";
import path from "path";
import { promises as fs } from "fs";

const DB_PATH = path.join(process.cwd(), "data", "mtf-tracker.db");

let _db: Database.Database | null = null;

export async function getMtfDb(): Promise<Database.Database> {
  if (_db) return _db;

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS mtf_daily (
      date               TEXT NOT NULL,
      symbol             TEXT NOT NULL,
      name               TEXT,
      qty_financed       INTEGER,
      amt_financed_lakhs REAL,
      open               REAL,
      high               REAL,
      low                REAL,
      close              REAL,
      prev_close         REAL,
      volume             INTEGER,
      turnover_lakhs     REAL,
      trades             INTEGER,
      deliv_qty          INTEGER,
      deliv_pct          REAL,
      series             TEXT,
      PRIMARY KEY (date, symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_mtf_daily_symbol ON mtf_daily(symbol);
    CREATE INDEX IF NOT EXISTS idx_mtf_daily_date ON mtf_daily(date);

    -- From the "MTF DATA POSITIVE"/"MTF DATA NEGATIVE" sheets (Volume Movers
    -- panel only). "cont" is the report's own count of positive (POSITIVE
    -- sheet) or negative (NEGATIVE sheet) day-over-day financed-amount
    -- changes across its trailing ~5-day window -- confirmed by hand against
    -- real data (2026-07-16): it is a frequency count, NOT a consecutive
    -- streak (a stock with +,-,-,+,+ across the window gets cont=3 in the
    -- POSITIVE sheet and cont=2 in the NEGATIVE sheet simultaneously, which
    -- a true streak could never produce for the same day).
    CREATE TABLE IF NOT EXISTS mtf_mover_cont (
      date                  TEXT NOT NULL,
      symbol                TEXT NOT NULL,
      direction             TEXT NOT NULL CHECK(direction IN ('up','down')),
      cont                  INTEGER NOT NULL,
      latest_pct_chg        REAL,
      price_cont            INTEGER,
      price_latest_pct_chg  REAL,
      PRIMARY KEY (date, symbol, direction)
    );

    CREATE INDEX IF NOT EXISTS idx_mtf_mover_cont_date ON mtf_mover_cont(date);
  `);

  // price_cont/price_latest_pct_chg: added after mtf_mover_cont already
  // shipped, so existing on-disk databases need an explicit migration --
  // this codebase's first column addition to an existing table (every prior
  // change has been a new CREATE TABLE IF NOT EXISTS). Guarded by
  // pragma table_info so it's safe to run against a fresh DB (columns
  // already present via the CREATE TABLE above) or an older one.
  const moverContColumns = _db.prepare("PRAGMA table_info(mtf_mover_cont)").all() as { name: string }[];
  const moverContColumnNames = new Set(moverContColumns.map((c) => c.name));
  if (!moverContColumnNames.has("price_cont")) {
    _db.exec("ALTER TABLE mtf_mover_cont ADD COLUMN price_cont INTEGER");
  }
  if (!moverContColumnNames.has("price_latest_pct_chg")) {
    _db.exec("ALTER TABLE mtf_mover_cont ADD COLUMN price_latest_pct_chg REAL");
  }

  // series: added after mtf_daily already shipped -- same migration pattern as
  // price_cont above. Holds BHAVCOPY's own SERIES code (EQ, BE, BZ, ...),
  // used to identify Trade-to-Trade (T2T) symbols directly from the
  // exchange's own classification rather than inferring it from delivery %
  // (see isTradeToTrade in queries.ts for why the inference was wrong).
  const mtfDailyColumns = _db.prepare("PRAGMA table_info(mtf_daily)").all() as { name: string }[];
  if (!mtfDailyColumns.some((c) => c.name === "series")) {
    _db.exec("ALTER TABLE mtf_daily ADD COLUMN series TEXT");
  }

  return _db;
}

export interface MtfDailyRow {
  date: string;
  symbol: string;
  name: string | null;
  qty_financed: number | null;
  amt_financed_lakhs: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  prev_close: number | null;
  volume: number | null;
  turnover_lakhs: number | null;
  trades: number | null;
  deliv_qty: number | null;
  deliv_pct: number | null;
  series: string | null;
}
