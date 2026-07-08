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
      PRIMARY KEY (date, symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_mtf_daily_symbol ON mtf_daily(symbol);
    CREATE INDEX IF NOT EXISTS idx_mtf_daily_date ON mtf_daily(date);
  `);

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
}
