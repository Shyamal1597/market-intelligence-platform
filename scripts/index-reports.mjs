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

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 300;

// ── Company → NSE Symbol map ──────────────────────────────────────────────────
// Keys are lowercase. Partial prefix matching used as fallback.
const SYMBOL_MAP = {
  "abrel": "ABREL",
  "aesl": "AESL",
  "afl": "AFL",
  "adani energy solutions": "ADANIENSOL",
  "adani energy": "ADANIENSOL",
  "ajanta pharma": "AJANTPHARM",
  "alicon castalloy": "ALICON",
  "alicon": "ALICON",
  "ambuja cement": "AMBUJACEM",
  "arkade developers": "ARKADE",
  "arvind smartspaces": "ARVSMART",
  "arvind": "ARVIND",
  "asian paints": "ASIANPAINT",
  "avalon technologies": "AVALON",
  "axis bank": "AXISBANK",
  "bajaj auto": "BAJAJ-AUTO",
  "belrise industries": "BELRISE",
  "belrise": "BELRISE",
  "capacite infraprojects": "CAPACITE",
  "cub": "CUB",
  "ddev plastiks": "DDEVPLASTIK",
  "elin electronics": "ELIN",
  "epigral": "EPIGRAL",
  "federal bank": "FEDERALBNK",
  "fiem industries": "FIEMIND",
  "gail": "GAIL",
  "galaxy surfactants": "GALAXYSURF",
  "galaxy": "GALAXYSURF",
  "gem aromatics": "GEMAROMA",
  "ghcl": "GHCL",
  "gmm pfaudler": "GMMPFAUDLR",
  "godrejconsumer": "GODREJCP",
  "godrej consumer": "GODREJCP",
  "greaves cotton": "GREAVESCOT",
  "hdfc bank": "HDFCBANK",
  "hg infra": "HGINFRA",
  "hul": "HINDUNILVR",
  "hindustan unilever": "HINDUNILVR",
  "icici bank": "ICICIBANK",
  "iciciprulife": "ICICIPRULI",
  "icici pru": "ICICIPRULI",
  "icil": "ICIL",
  "ig petrochemicals": "IGPL",
  "infosys": "INFY",
  "jash engineering": "JASH",
  "jg chemical": "JGCHEM",
  "jkil": "JKIL",
  "kbl": "KTKBANK",
  "kajaria ceramics": "KAJARIACER",
  "kirloskar brothers": "KIRLOSBROS",
  "kkcl": "KKCL",
  "kolte patil developers": "KOLTEPATIL",
  "kolte patil": "KOLTEPATIL",
  "lic of india": "LICI",
  "lichf": "LICHSGFIN",
  "lodha": "LODHA",
  "lumax industries": "LUMAXIND",
  "meghmani organics": "MEGHMANORG",
  "meghmani": "MEGHMANORG",
  "minda corp": "MINDACORP",
  "naukri": "NAUKRI",
  "ntpc": "NTPC",
  "ongc": "ONGC",
  "paytm": "PAYTM",
  "pcbl chemical": "PCBL",
  "pcbl": "PCBL",
  "phoenix mills": "PHOENIXLTD",
  "pi industries": "PIIND",
  "pnc infra": "PNCINFRA",
  "powergrid": "POWERGRID",
  "power grid": "POWERGRID",
  "privi specialty chemicals": "PRIVISCL",
  "privi speciality chemicals": "PRIVISCL",
  "privi": "PRIVISCL",
  "protean egov": "PROTEAN",
  "protean": "PROTEAN",
  "psp projects": "PSPPROJECT",
  "rolex rings": "ROLEXRINGS",
  "sandhar tech": "SANDHAR",
  "sandhar": "SANDHAR",
  "sbi": "SBIN",
  "sharda motor industries": "SHARDAMOTR",
  "sharda motor": "SHARDAMOTR",
  "sib": "SOUTHBANK",
  "somany ceramics": "SOMANYCERA",
  "somany": "SOMANYCERA",
  "sswl": "SSWL",
  "sun pharma": "SUNPHARMA",
  "swrel": "SWEL",
  "syrma sgs technology": "SYRMA",
  "syrma sgs": "SYRMA",
  "transrail": "TRANSRAIL",
  "upl": "UPL",
  "va tech-wabag": "WABAG",
  "va tech wabag": "WABAG",
  "vishnu chemicals": "VISHNU",
  "wipro": "WIPRO",
  "yatharth hospital": "YATHARTH",
  "yathart hospital": "YATHARTH",
};

/** Strip quarter codes, report-type noise, and trailing junk from company name */
function cleanCompany(raw) {
  return raw
    // Strip: " - Q1FY26RU", " Q4FY25", "Q2FY26RU", "FY26RU", etc.
    .replace(/[\s\-–]*\bQ[1-4]FY\d{2}(?:RU|CU|IC|AU)?\b/gi, "")
    // Strip trailing noise phrases (Con Call, Management Meet, New Ideas, etc.)
    .replace(/[\s\-–]*(Con[\s]+Call[\s]+Intimation|Management[\s]+Meet[\s]+Note|New[\s]+Ideas(?:[\s]+IC)?|Plant[\s]+Visit(?:[\s]+Note)?|Company[\s]+Update|Visit[\s]+Note)\b.*/gi, "")
    // Strip standalone type codes left at end
    .replace(/[\s\-–]+(RU|CU|IC|AU)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Derive NSE symbol from cleaned company name */
function deriveSymbol(company) {
  const key = company.toLowerCase().trim();
  // Exact match
  if (SYMBOL_MAP[key]) return SYMBOL_MAP[key];
  // Prefix match (longest key that company starts with)
  let best = "";
  for (const k of Object.keys(SYMBOL_MAP)) {
    if (key.startsWith(k) && k.length > best.length) best = k;
  }
  if (best) return SYMBOL_MAP[best];
  // Fallback: uppercase with special chars removed (works for AESL, ABREL, AFL, etc.)
  return company.toUpperCase().replace(/[\s&\-.'()]+/g, "").slice(0, 12);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFilename(filename, analystFolder) {
  const base = path.basename(filename, ".pdf");

  // 1. Extract date — try DDMMYYYY (8-digit) first, fall back to DDMMYY (6-digit)
  let date = new Date().toISOString().slice(0, 10);
  const dateM8 = base.match(/(\d{2})(\d{2})(\d{4})(?:[^0-9]|$)/);
  const dateM6 = base.match(/(\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/);
  if (dateM8) {
    const [, dd, mm, yyyy] = dateM8;
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d.getTime()) && parseInt(yyyy) >= 2020) date = `${yyyy}-${mm}-${dd}`;
  } else if (dateM6) {
    const [, dd, mm, yy] = dateM6;
    const yyyy = "20" + yy;
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d.getTime())) date = `${yyyy}-${mm}-${dd}`;
  }

  // 2. Detect report type from full base string
  let reportType = "Other";
  if (/visit[\s_\-]*note/i.test(base)) {
    reportType = "Visit Note";
  } else if (/technical/i.test(base)) {
    reportType = "Technical";
  } else {
    // Each _-delimited segment: check if it contains/ends with a type code
    for (const seg of base.split("_")) {
      const s = seg.trim();
      if (/^IC$/i.test(s) || /\bIC\b/i.test(s)) { reportType = "IC"; break; }
      if (/^CU$/i.test(s) || /\bCU\b/i.test(s)) { reportType = "CU"; break; }
      if (/^RU$/i.test(s) || /RU\b/i.test(s))   { reportType = "RU"; break; }
      if (/^AU$/i.test(s) || /AU\b/i.test(s))   { reportType = "AU"; break; }
    }
  }

  // 3. Company name: everything before the first type-bearing segment,
  //    stripped of trailing "Sunidhi", dates, and underscores.
  const segs = base.split("_");
  let typeSegIdx = -1;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i].trim();
    if (/visit[\s_\-]*note/i.test(s) || /technical/i.test(s) ||
        /^(IC|CU|RU|AU)$/i.test(s) || /(IC|CU|RU|AU)\b/i.test(s) ||
        /RU\b/i.test(s)) {
      typeSegIdx = i;
      break;
    }
    // Also stop before any segment that is mostly digits (date segment)
    if (/^\s*(?:Sunidhi)?\d{6,}\s*$/i.test(s)) { typeSegIdx = i; break; }
  }

  let company = (typeSegIdx > 0 ? segs.slice(0, typeSegIdx) : [segs[0]])
    .join(" ")
    .replace(/\bSunidhi\b/gi, "")
    .replace(/\d{8}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // For "COMPANY-Visit Note" patterns, take only the part before the dash
  if (/visit[\s_\-]*note/i.test(company)) {
    company = company.split(/[\-–]/)[0].trim();
  }

  return { analyst: analystFolder, company: company || "Unknown", reportType, date };
}

function parseNumber(raw) { return parseFloat(raw.replace(/,/g, "")) || 0; }

function extractMeta(text) {
  // Rating — match isolated keyword in first 3000 chars (skip long prose)
  const sample = text.slice(0, 3000);
  const ratingM = sample.match(
    /\b(BUY|SELL|HOLD|ACCUMULATE|REDUCE|NEUTRAL|OUTPERFORM|UNDERPERFORM|ADD)\b/i
  );

  // CMP — "CMP (Rs.) 1,234" or "CMP: ₹1,234" or "CMP 1234"
  const cmpM = text.match(
    /\bCMP\s*(?:\([^)]*\)|:)?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i
  );

  // Target Price — various label styles
  const tpM = text.match(
    /(?:Target\s*Price|Price\s*Target|\bTP\b)\s*(?:\([^)]*\)|:)?\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i
  );

  return {
    rating: ratingM ? ratingM[1].toUpperCase() : "",
    cmp: cmpM ? parseNumber(cmpM[1]) : 0,
    targetPrice: tpM ? parseNumber(tpM[1]) : 0,
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
      fn.company = cleanCompany(fn.company);
      const symbol = deriveSymbol(fn.company);
      const meta = extractMeta(result.text);
      const chunks = chunkText(result.text, id);
      insertReport.run({ id, symbol, ...fn, ...meta, filePath });
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
