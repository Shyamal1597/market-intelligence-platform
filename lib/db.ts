/**
 * SQLite database singleton for the reports store.
 * Uses better-sqlite3 (synchronous, no async overhead).
 *
 * Tables:
 *   reports      -- one row per PDF (metadata)
 *   chunks       -- text chunks from each PDF
 *   chunks_fts   -- FTS5 virtual table over chunks.text (built-in BM25 ranking)
 */
import Database from "better-sqlite3";
import path from "path";
import { promises as fs } from "fs";

const DB_PATH = path.join(process.cwd(), "data", "reports.db");

let _db: Database.Database | null = null;

export async function getDb(): Promise<Database.Database> {
  if (_db) return _db;

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT PRIMARY KEY,
      analyst     TEXT NOT NULL,
      company     TEXT NOT NULL,
      symbol      TEXT NOT NULL DEFAULT '',
      reportType  TEXT NOT NULL DEFAULT 'Other',
      date        TEXT NOT NULL,
      rating      TEXT NOT NULL DEFAULT '',
      cmp         REAL NOT NULL DEFAULT 0,
      targetPrice REAL NOT NULL DEFAULT 0,
      filePath    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id       TEXT PRIMARY KEY,
      reportId TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      text     TEXT NOT NULL,
      pageNum  INTEGER NOT NULL DEFAULT 1
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
    USING fts5(text, reportId UNINDEXED, content=chunks, content_rowid=rowid);

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text, reportId) VALUES (new.rowid, new.text, new.reportId);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text, reportId) VALUES ('delete', old.rowid, old.text, old.reportId);
    END;
  `);

  return _db;
}

// -- Types --------------------------------------------------------------------

export interface ReportRow {
  id: string;
  analyst: string;
  company: string;
  symbol: string;
  reportType: string;
  date: string;
  rating: string;
  cmp: number;
  targetPrice: number;
  filePath: string;
}

export interface ChunkRow {
  id: string;
  reportId: string;
  text: string;
  pageNum: number;
}

export interface SearchHit {
  text: string;
  reportId: string;
  pageNum: number;
  rank: number;
}
