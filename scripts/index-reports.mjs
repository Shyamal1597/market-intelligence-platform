/**
 * Standalone PDF indexer — run with: node scripts/index-reports.mjs
 * Each PDF is extracted in its own child process to avoid OOM crashes.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const EXTRACTOR = path.join(__dirname, "extract-single.mjs");

const REPORTS_BASE = "D:\\Sunidhi Intranet\\Research Reports";
const DATA_DIR = path.join(PROJECT_ROOT, "data", "reports");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");
const CHUNKS_PATH = path.join(DATA_DIR, "chunks.json");

const MONTH_MAP = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};
const REPORT_TYPE_CODES = ["IC","RU","CU"];
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function parseFilename(filename, analystFolder) {
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");

  let typeIdx = -1;
  let reportType = "Other";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if (REPORT_TYPE_CODES.includes(p)) { typeIdx = i; reportType = p; break; }
    if (p.startsWith("TECHNICAL")) { typeIdx = i; reportType = "Technical"; break; }
  }

  const company = typeIdx > 0 ? parts.slice(0, typeIdx).join(" ") : parts[0];
  const datePart = parts[parts.length - 1].replace(/^Sunidhi/i, "");
  let date = "";
  const m = datePart.match(/([A-Za-z]{3})(\d{2})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon) date = `${parseInt(m[2]) + 2000}-${mon}-01`;
  }
  if (!date) date = new Date().toISOString().slice(0, 10);

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
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 50) chunks.push({ id: crypto.randomUUID(), reportId, text: slice, pageNum });
    start = end - CHUNK_OVERLAP;
    pageNum++;
  }
  return chunks;
}

function extractPDF(filePath) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [EXTRACTOR, filePath],
      { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, // 50MB buffer, 60s timeout
      (err, stdout) => {
        if (err && !stdout) { resolve({ ok: false, error: err.message }); return; }
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ ok: false, error: "bad JSON from extractor" }); }
      }
    );
  });
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const allMeta = [];
  const allChunks = [];
  let indexed = 0, skipped = 0, total = 0;

  const analystFolders = await fs.readdir(REPORTS_BASE);

  // Count total PDFs first
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

      allMeta.push({ id, analyst: fn.analyst, company: fn.company, symbol: "", reportType: fn.reportType, date: fn.date, ...meta, filePath });
      allChunks.push(...chunkText(result.text, id));
      indexed++;
      console.log(`OK  (${result.text.length} chars, ${allChunks.length - (indexed > 1 ? allChunks.length : 0)} chunks)`);
    }
  }

  await fs.writeFile(METADATA_PATH, JSON.stringify(allMeta, null, 2));
  await fs.writeFile(CHUNKS_PATH, JSON.stringify(allChunks, null, 2));

  console.log(`\n✓ Done: ${indexed} indexed, ${skipped} skipped`);
  console.log(`  metadata.json → ${allMeta.length} reports`);
  console.log(`  chunks.json   → ${allChunks.length} chunks`);
}

main().catch(err => { console.error(err); process.exit(1); });
