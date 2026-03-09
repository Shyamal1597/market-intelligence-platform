/**
 * Standalone PDF indexer → SQLite
 * Run with: node scripts/index-reports.mjs
 *
 * Each PDF is extracted in its own child process (memory isolation).
 * Results are written to data/reports.db (SQLite, FTS5-indexed for RAG search).
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const EXTRACTOR = path.join(__dirname, "extract-single.mjs");

const REPORTS_BASE = "D:\\Sunidhi Intranet\\Research Reports";
const DB_PATH = path.join(PROJECT_ROOT, "data", "reports.db");

const MONTH_MAP = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};
const REPORT_TYPE_CODES = ["IC","RU","CU"];
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFilename(filename, analystFolder) {
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");

  let typeIdx = -1, reportType = "Other";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if (REPORT_TYPE_CODES.includes(p)) { typeIdx = i; reportType = p; break; }
    if (p.startsWith("TECHNICAL")) { typeIdx = i; reportType = "Technical"; break; }
  }

  const company = typeIdx > 0 ? parts.slice(0, typeIdx).join(" ") : parts[0];
  const datePart = parts[parts.length - 1].replace(/^Sunidhi/i, "");
  let date = new Date().toISOString().slice(0, 10);
  const m = datePart.match(/([A-Za-z]{3})(\d{2})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon) date = `${parseInt(m[2]) + 2000}-${mon}-01`;
  }
  return { analyst: analystFolder, company, reportType, date };
}

function parseNumber(raw) { return parseFloat(raw.replace(/,/g, "")) || 0; }

function extractMeta(text) {
  const r = text.match(/(?:recommendation|rating)\s*[:\-–]?\s*([A-Za-z][^\n]{2,30})/i);
  const c = text.match(/CMP\s*\([\u20B9Rs.]+\)\s*([\d,]+(?:\.\d+)?)/i);
  const t = text.match(/Price\s*Target\s*\([\u20B9Rs.]+\)\s*([\d,]+(?:\.\d+)?)/i);
  return {
    rating: r ? r[1].trim() : "",
    cmp: c ? parseNumber(c[1]) : 0,
    targetPrice: t ? parseNumber(t[1]) : 0,
  };
}

function chunkText(text, reportId) {
  const chunks = [];
  let start = 0, pageNum = 1;
  const step = CHUNK_SIZE - CHUNK_OVERLAP; // always advance by this
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 50) chunks.push({ id: crypto.randomUUID(), reportId, text: slice, pageNum });
    start += step;
    pageNum++;
  }
  return chunks;
}

function extractPDF(filePath) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [EXTRACTOR, filePath],
      { maxBuffer: 32 * 1024 * 1024, timeout: 120000 },
      (err, stdout) => {
        // extractor writes exactly one JSON line to stdout
        const line = (stdout ?? "").trim().split(/\r?\n/).pop() ?? "";
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false, error: err?.message ?? `bad output: ${line.slice(0, 120)}` });
        }
      }
    );
  });
}

// ── DB setup ─────────────────────────────────────────────────────────────────

async function initDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, analyst TEXT, company TEXT,
      symbol TEXT DEFAULT '', reportType TEXT DEFAULT 'Other',
      date TEXT, rating TEXT DEFAULT '', cmp REAL DEFAULT 0,
      targetPrice REAL DEFAULT 0, filePath TEXT
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY, reportId TEXT REFERENCES reports(id) ON DELETE CASCADE,
      text TEXT, pageNum INTEGER DEFAULT 1
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
  return db;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(path.join(PROJECT_ROOT, "data"), { recursive: true });
  const db = await initDb();

  // Wipe existing data (full re-index)
  db.exec("DELETE FROM chunks; DELETE FROM reports;");

  const insertReport = db.prepare(`
    INSERT OR REPLACE INTO reports (id, analyst, company, symbol, reportType, date, rating, cmp, targetPrice, filePath)
    VALUES (@id, @analyst, @company, @symbol, @reportType, @date, @rating, @cmp, @targetPrice, @filePath)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, reportId, text, pageNum) VALUES (@id, @reportId, @text, @pageNum)
  `);
  const insertBatch = db.transaction((chunks) => {
    for (const c of chunks) insertChunk.run(c);
  });

  let indexed = 0, skipped = 0, total = 0;

  const analystFolders = await fs.readdir(REPORTS_BASE);
  for (const folder of analystFolders) {
    const fp = path.join(REPORTS_BASE, folder);
    if (!(await fs.stat(fp)).isDirectory()) continue;
    const files = await fs.readdir(fp);
    total += files.filter(f => f.toLowerCase().endsWith(".pdf")).length;
  }

  let n = 0;
  for (const folder of analystFolders) {
    const folderPath = path.join(REPORTS_BASE, folder);
    if (!(await fs.stat(folderPath)).isDirectory()) continue;

    const files = await fs.readdir(folderPath);
    const pdfs = files.filter(f => f.toLowerCase().endsWith(".pdf"));

    for (const pdf of pdfs) {
      n++;
      const filePath = path.join(folderPath, pdf);
      process.stdout.write(`[${n}/${total}] ${folder}/${pdf} ... `);

      const result = await extractPDF(filePath);

      if (!result.ok || !result.text || result.text.length < 100) {
        console.log(`SKIP (${result.error ?? "no text"})`);
        skipped++;
        continue;
      }

      const id = crypto.randomUUID();
      const fn = parseFilename(pdf, folder);
      const meta = extractMeta(result.text);
      const chunks = chunkText(result.text, id);
      insertReport.run({ id, symbol: "", ...fn, ...meta, filePath });
      insertBatch(chunks);

      indexed++;
      console.log(`OK  (${result.text.length} chars → ${chunks.length} chunks) [${result.method ?? "?"}]`);
    }
  }

  db.close();
  console.log(`\n✓ Done: ${indexed} indexed, ${skipped} skipped`);
  console.log(`  DB: ${DB_PATH}`);
  const stat = await fs.stat(DB_PATH);
  console.log(`  Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
