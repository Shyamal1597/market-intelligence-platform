/**
 * Standalone PDF indexer — run with: node scripts/index-reports.mjs
 * Runs outside Next.js so it won't crash the dev server.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

const REPORTS_BASE = "D:\\Sunidhi Intranet\\Research Reports";
const DATA_DIR = path.join(PROJECT_ROOT, "data", "reports");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");
const CHUNKS_PATH = path.join(DATA_DIR, "chunks.json");

const MONTH_MAP = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};
const REPORT_TYPE_CODES = ["IC","RU","CU","TECHNICAL"];
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function parseFilename(filename, analystFolder) {
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");

  let typeIdx = -1;
  let reportType = "Other";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if (REPORT_TYPE_CODES.includes(p) || p.startsWith("TECHNICAL")) {
      typeIdx = i;
      reportType = p === "TECHNICAL" || p.startsWith("TECHNICAL") ? "Technical" : p;
      break;
    }
  }

  const company = typeIdx > 0 ? parts.slice(0, typeIdx).join(" ") : parts[0];
  const datePart = parts[parts.length - 1].replace(/^Sunidhi/i, "");
  let date = "";
  const monthMatch = datePart.match(/([A-Za-z]{3})(\d{2})$/);
  if (monthMatch) {
    const mon = MONTH_MAP[monthMatch[1].toLowerCase()];
    if (mon) date = `${parseInt(monthMatch[2]) + 2000}-${mon}-01`;
  }
  if (!date) date = new Date().toISOString().slice(0, 10);

  return { analyst: analystFolder, company, reportType, date };
}

function parseNumber(raw) {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function extractMeta(text) {
  const ratingMatch = text.match(/(?:recommendation|rating)\s*[:\-–]?\s*([A-Za-z][^\n]{2,30})/i);
  const cmpMatch = text.match(/CMP\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);
  const tpMatch = text.match(/Price\s*Target\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);
  return {
    rating: ratingMatch ? ratingMatch[1].trim() : "",
    cmp: cmpMatch ? parseNumber(cmpMatch[1]) : 0,
    targetPrice: tpMatch ? parseNumber(tpMatch[1]) : 0,
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

async function main() {
  const { extractText } = await import("unpdf");
  await fs.mkdir(DATA_DIR, { recursive: true });

  const allMeta = [];
  const allChunks = [];
  let indexed = 0, skipped = 0;

  const analystFolders = await fs.readdir(REPORTS_BASE);

  for (const folder of analystFolders) {
    const folderPath = path.join(REPORTS_BASE, folder);
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(folderPath);
    const pdfs = files.filter(f => f.toLowerCase().endsWith(".pdf"));

    for (const pdf of pdfs) {
      const filePath = path.join(folderPath, pdf);
      process.stdout.write(`[${indexed + skipped + 1}/161] ${folder}/${pdf} ... `);

      try {
        const buffer = await fs.readFile(filePath);
        const { text: extractedPages } = await extractText(new Uint8Array(buffer), { mergePages: true });
        const text = Array.isArray(extractedPages) ? extractedPages.join("\n") : (extractedPages ?? "");

        if (!text || text.length < 100) {
          console.log("SKIP (no text)");
          skipped++;
          continue;
        }

        const id = crypto.randomUUID();
        const fromFilename = parseFilename(pdf, folder);
        const fromText = extractMeta(text);

        allMeta.push({
          id,
          analyst: fromFilename.analyst,
          company: fromFilename.company,
          symbol: "",
          reportType: fromFilename.reportType,
          date: fromFilename.date,
          rating: fromText.rating,
          cmp: fromText.cmp,
          targetPrice: fromText.targetPrice,
          filePath,
        });
        allChunks.push(...chunkText(text, id));
        indexed++;
        console.log(`OK (${text.length} chars)`);
      } catch (err) {
        console.log(`SKIP (${err.message})`);
        skipped++;
      }
    }
  }

  await fs.writeFile(METADATA_PATH, JSON.stringify(allMeta, null, 2));
  await fs.writeFile(CHUNKS_PATH, JSON.stringify(allChunks, null, 2));

  console.log(`\nDone: ${indexed} indexed, ${skipped} skipped`);
  console.log(`metadata.json: ${allMeta.length} reports`);
  console.log(`chunks.json: ${allChunks.length} chunks`);
}

main().catch(err => { console.error(err); process.exit(1); });
