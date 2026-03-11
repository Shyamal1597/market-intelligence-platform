/**
 * Debug: show the ratio+BS section lines for a symbol, annotating which
 * rows match which parser patterns.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'reports.db');
const db = new Database(DB_PATH, { readonly: true });

const symbol = process.argv[2] || 'CEMPROINDIA';
const report = db.prepare(`SELECT id, reportType, date FROM reports WHERE symbol = ?
  ORDER BY CASE reportType WHEN 'IC' THEN 0 WHEN 'RU' THEN 1 ELSE 2 END ASC, date DESC LIMIT 1`).get(symbol.toUpperCase());
if (!report) { console.log('No report for', symbol); process.exit(1); }
console.log(`Report: ${report.reportType} ${report.date}\n`);

const chunks = db.prepare(`SELECT text, pageNum FROM chunks WHERE reportId = ? ORDER BY pageNum ASC`).all(report.id);
const text = chunks.map(c => c.text).join('\n');

// Find "Year End-March" section
const hdrRe = /Year\s+End[-–\s]*March([^\n]+)/i;
const hdrMatch = hdrRe.exec(text);
if (!hdrMatch) { console.log('No "Year End-March" found'); process.exit(1); }

console.log(`Found header:`);
console.log(`  "${hdrMatch[0].trim()}"\n`);

const segStart = text.indexOf(hdrMatch[0]) + hdrMatch[0].length;
const segment = text.slice(segStart, segStart + 6000);
const lines = segment.split('\n');

// Extract year count
const yRe = /FY(\d{2}[EP]?)/gi;
const rawYears = [];
let ym;
while ((ym = yRe.exec(hdrMatch[1])) !== null) rawYears.push(`FY${ym[1]}`);
const seen = new Set();
const years = [];
for (const y of rawYears) { const n = y.replace(/\s/g,''); if (!seen.has(n)) { seen.add(n); years.push(n); } }
const N = years.length;
console.log(`Years (N=${N}): ${years.join(', ')}\n`);

function parseNums(s) {
  const out = [];
  const re = /\(([\d,]+(?:\.\d+)?)\)|(-?[\d,]+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) out.push(-parseFloat(m[1].replace(/,/g,'')));
    else out.push(parseFloat(m[2].replace(/,/g,'')));
  }
  return out;
}

// Pattern definitions: [name, test-fn]
const patterns = [
  ['EPS',         (lt, _line) => /^(?:a-?|adj\.?\s+)?eps\b|^eps\s*\(adj/i.test(lt)],
  ['P/E',         (lt, _line) => /^p\/e\b/.test(lt)],
  ['EV/EBITDA',   (lt, _line) => /^ev\/ebi[dt]{2}a/.test(lt)],
  ['EBITDA%',     (lt, _line) => /ebi[dt]{2}a\s*margin/.test(lt)],
  ['ROE',         (lt, _line) => /\bro[ae]{1,2}\b|\broace\b|return on (avg\.?|average)?\s*equity/i.test(lt)],
  ['Equity',      (_lt, line) => /net\s*worth\b|shareholders'?\s*equity\b|total\s*equity\b|book\s*value\b/i.test(line)],
  ['TotalDebt',   (_lt, line) => /total\s*(?:debt|borrow)\b|long\s*term\s*borrow/i.test(line)],
  ['TotalAssets', (_lt, line) => /total\s*assets?\b|grand\s*total\b/i.test(line)],
];

for (let i = 0; i < Math.min(lines.length, 80); i++) {
  const line = lines[i];
  const lt = line.trim().toLowerCase();
  const ns = parseNums(line);

  const matched = patterns.filter(([_n, fn]) => fn(lt, line)).map(([n]) => n);

  if (matched.length === 0 && ns.length < 2) continue; // skip blank/unrelevant

  const tag = matched.length ? matched.join(',') : '-';
  const ratioVals = ns.slice(0, N);
  const bsVals = ns.slice(-N);
  console.log(`L${String(i).padStart(3)}: [${tag}]  nums=${ns.length}  ratio=${JSON.stringify(ratioVals)}  bs=${JSON.stringify(bsVals)}`);
  console.log(`       "${line.trim().slice(0, 130)}"`);
}
