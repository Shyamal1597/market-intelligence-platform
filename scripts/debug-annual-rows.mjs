/**
 * Debug: trace every FY regex match in JASH chunks — ALL matches, no filter
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'reports.db');
const db = new Database(DB_PATH, { readonly: true });

const symbol = process.argv[2] || 'JASH';
const report = db.prepare(`SELECT id, reportType, date FROM reports WHERE symbol = ? ORDER BY CASE reportType WHEN 'IC' THEN 0 WHEN 'RU' THEN 1 ELSE 2 END ASC, date DESC LIMIT 1`).get(symbol.toUpperCase());
if (!report) { console.log('No report for', symbol); process.exit(1); }
console.log(`Report: ${report.reportType} ${report.date}`);

const chunks = db.prepare(`SELECT text, pageNum FROM chunks WHERE reportId = ? ORDER BY pageNum ASC`).all(report.id);
const text = chunks.map(c => c.text).join('\n');
const lines = text.split('\n');

// EXACT same regex as parser
const RE = /\b(FY(\d{2}))[ ]?([EP])?\s{2,}(?=[\d(])/;

let matchCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(RE);
  if (!m) continue;
  matchCount++;

  const base = m[1];
  const estChar = m[3];
  const fy = estChar ? `${base}${estChar}` : base;
  const afterFY = line.slice(m.index + m[0].length);

  // Quick token count
  const re2 = /\(([\d,]+(?:\.\d+)?)\)|(-?[\d,]+(?:\.\d+)?)/g;
  let cnt = 0; let firstVal = null;
  let m2;
  while ((m2 = re2.exec(afterFY)) !== null) {
    const v = m2[1] !== undefined ? -parseFloat(m2[1].replace(/,/g,'')) : parseFloat(m2[2].replace(/,/g,''));
    if (cnt === 0) firstVal = v;
    cnt++;
  }

  // Show ALL (including those filtered out)
  const keep = cnt >= 5 && firstVal >= 100;
  console.log(`[${keep ? 'KEEP' : 'skip'}] Line ${i}: FY="${fy}" (m[1]="${m[1]}" m[3]="${m[3]}")`);
  console.log(`       match="${m[0].replace(/\s+/g,'·')}" tokens=${cnt} firstVal=${firstVal}`);
  if (fy.length > 5) {
    console.log(`       *** DOUBLE-E DETECTED *** raw line: "${line.slice(Math.max(0, m.index-5), m.index + 60)}"`);
  }
}

console.log(`\nTotal FY matches: ${matchCount}`);
