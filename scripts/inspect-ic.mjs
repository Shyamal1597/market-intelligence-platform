import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../data/reports.db'));

// Get CEMPROINDIA IC (60 chunks) and one more IC
const reports = db.prepare(`
  SELECT r.id, r.symbol, r.company, r.reportType, r.date
  FROM reports r
  WHERE r.reportType = 'IC' AND r.symbol != ''
  ORDER BY r.date DESC
  LIMIT 5
`).all();

for (const rep of reports.slice(0, 2)) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${rep.symbol} | ${rep.reportType} | ${rep.date}`);
  console.log('='.repeat(80));

  const chunks = db.prepare(
    'SELECT text, pageNum FROM chunks WHERE reportId=? ORDER BY pageNum'
  ).all(rep.id);
  console.log(`Total chunks: ${chunks.length}\n`);

  for (const c of chunks) {
    const t = c.text;
    if (
      /financials.*revenues|year end.march.*fy\d{2}|quarterly performance|consolidated quarterly|valuation.*ratio|p\/e\s+\d|ev\/ebitda\s+\d|balance sheet/i.test(t)
    ) {
      console.log(`--- chunk #${c.pageNum} ---`);
      console.log(t.substring(0, 1500));
      console.log('...\n');
    }
  }
}
