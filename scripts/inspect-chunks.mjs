import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../data/reports.db'));

// Get sample IC/RU reports
const reports = db.prepare(`
  SELECT r.id, r.symbol, r.company, r.reportType, r.date
  FROM reports r
  WHERE r.reportType IN ('IC','RU','CU','AU') AND r.symbol != ''
  ORDER BY r.date DESC
  LIMIT 10
`).all();

for (const rep of reports.slice(0, 5)) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${rep.symbol} | ${rep.reportType} | ${rep.date} | ${rep.company}`);
  console.log('='.repeat(70));

  const chunks = db.prepare(
    'SELECT text, pageNum FROM chunks WHERE reportId=? ORDER BY pageNum'
  ).all(rep.id);

  console.log(`Total chunks: ${chunks.length}`);

  // Show ALL chunks that mention financial keywords
  let shown = 0;
  for (const c of chunks) {
    const t = c.text;
    if (/revenue|ebitda|pat\b|eps\b|margin|fy2[0-9]|q[0-9]fy|valuation|balance\s*sheet|borrowing|p\/e|ev\/|net\s*profit/i.test(t)) {
      if (shown >= 3) continue;
      console.log(`\n--- chunk #${c.pageNum} (${t.length} chars) ---`);
      console.log(t.substring(0, 800));
      shown++;
    }
  }
  if (shown === 0) {
    // Show first 2 chunks regardless
    for (const c of chunks.slice(0, 2)) {
      console.log(`\n--- chunk #${c.pageNum} ---`);
      console.log(c.text.substring(0, 400));
    }
  }
}
