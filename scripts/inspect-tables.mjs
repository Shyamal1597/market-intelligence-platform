import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../data/reports.db'));

// Get one IC and a few RU reports to inspect table chunks
const reports = db.prepare(`
  SELECT r.id, r.symbol, r.company, r.reportType, r.date
  FROM reports r
  WHERE r.reportType IN ('IC','RU') AND r.symbol != ''
  ORDER BY r.date DESC
  LIMIT 20
`).all();

// Look at CEMPROINDIA (IC, 60 chunks) and a couple RUs
const targets = reports.filter(r =>
  ['CEMPROINDIA','JASH','VISHNU','GALAXYSURF','LUMAX'].includes(r.symbol)
);

for (const rep of targets.slice(0, 3)) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${rep.symbol} | ${rep.reportType} | ${rep.date}`);
  console.log('='.repeat(80));

  const chunks = db.prepare(
    'SELECT text, pageNum FROM chunks WHERE reportId=? ORDER BY pageNum'
  ).all(rep.id);

  console.log(`Total chunks: ${chunks.length}\n`);

  // Find ALL chunks with table-like patterns
  for (const c of chunks) {
    const t = c.text;
    // Financial table heuristic: multiple numbers on same line near keywords
    if (
      /fy2[0-9][ep]?\s+\d/i.test(t) ||
      /q[1-4]fy\d{2}\s+\d/i.test(t) ||
      /revenue.*\d{3,}.*\d{3,}/i.test(t) ||
      /ebitda.*\d{2,}.*\d{2,}/i.test(t) ||
      /net\s*profit.*\d{3,}/i.test(t) ||
      /p\/e\s+\d+/i.test(t) ||
      /ev\/ebitda/i.test(t) ||
      /balance\s*sheet/i.test(t) ||
      /quarterly\s*performance/i.test(t) ||
      /yearly\s*performance/i.test(t) ||
      /valuation.*ratio/i.test(t)
    ) {
      console.log(`--- chunk #${c.pageNum} (${t.length} chars) ---`);
      console.log(t);
      console.log();
    }
  }
}
