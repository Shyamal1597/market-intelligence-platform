import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'reports.db');
const db = new Database(DB_PATH, { readonly: true });

const symbol = process.argv[2] || 'JASH';
const pages = (process.argv[3] || '').split(',').map(Number).filter(Boolean);

const report = db.prepare(`
  SELECT id, reportType, date, analyst, company, symbol
  FROM reports WHERE symbol = ?
  ORDER BY CASE reportType WHEN 'IC' THEN 0 WHEN 'RU' THEN 1 ELSE 2 END ASC, date DESC LIMIT 1
`).get(symbol.toUpperCase());

if (!report) { console.log('No report for', symbol); process.exit(1); }
console.log(`\n=== ${report.company} (${report.symbol}) — ${report.reportType} ${report.date} ===`);

const chunks = db.prepare(`SELECT text, pageNum FROM chunks WHERE reportId = ? ORDER BY pageNum ASC`).all(report.id);
console.log(`Total chunks: ${chunks.length}\n`);

if (pages.length > 0) {
  // Show specific pages
  for (const pg of pages) {
    const c = chunks.find(c => c.pageNum === pg);
    if (c) {
      console.log(`\n=== PAGE ${pg} (length=${c.text.length}) ===`);
      console.log(c.text);
    } else {
      console.log(`\nPage ${pg} not found`);
    }
  }
} else {
  // Show last 8 pages (usually have financial tables)
  const lastPages = chunks.slice(-8);
  for (const c of lastPages) {
    console.log(`\n=== PAGE ${c.pageNum} (length=${c.text.length}) ===`);
    console.log(c.text.slice(0, 500));
    console.log('...');
  }
}
