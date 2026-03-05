import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
// unpdf handles Node.js/edge environments correctly — no DOMMatrix dependency

// ── Types (re-exported from client-safe module) ───────────────────────────────
export type { ReportMeta, Chunk } from "./reportTypes";
import type { ReportMeta, Chunk } from "./reportTypes";

// ── Constants ────────────────────────────────────────────────────────────────

const REPORTS_BASE = "D:\\Sunidhi Intranet\\Research Reports";
const DATA_DIR = path.join(process.cwd(), "data", "reports");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");
const CHUNKS_PATH = path.join(DATA_DIR, "chunks.json");

const REPORT_TYPE_CODES = ["IC", "RU", "CU", "Technical"] as const;

// Month abbreviation → zero-padded month number
const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12",
};

// ── Filename parsing ─────────────────────────────────────────────────────────

function parseFilename(filename: string, analystFolder: string): Partial<ReportMeta> {
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");

  // Find report type code index
  let typeIdx = -1;
  let reportType: ReportMeta["reportType"] = "Other";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if ((REPORT_TYPE_CODES as readonly string[]).includes(p)) {
      typeIdx = i;
      reportType = p as ReportMeta["reportType"];
      break;
    }
    if (p.startsWith("TECHNICAL")) {
      typeIdx = i;
      reportType = "Technical";
      break;
    }
  }

  const company = typeIdx > 0 ? parts.slice(0, typeIdx).join(" ") : parts[0];

  // Parse date from last segment (e.g. "SunidhiAug25" or "SunidhiQ1FY26")
  const datePart = parts[parts.length - 1].replace(/^Sunidhi/i, "");
  let date = "";
  const monthMatch = datePart.match(/([A-Za-z]{3})(\d{2})$/);
  if (monthMatch) {
    const mon = MONTH_MAP[monthMatch[1].toLowerCase()];
    if (mon) {
      const year = parseInt(monthMatch[2], 10) + 2000;
      date = `${year}-${mon}-01`;
    }
  }
  if (!date) {
    // Fallback: today
    date = new Date().toISOString().slice(0, 10);
  }

  return {
    analyst: analystFolder,
    company,
    reportType,
    date,
  };
}

// ── PDF text extraction + metadata regex ────────────────────────────────────

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function extractMetaFromText(text: string): Pick<ReportMeta, "rating" | "cmp" | "targetPrice"> {
  const ratingMatch = text.match(/(?:recommendation|rating)\s*[:\-–]?\s*([A-Za-z][^\n]{2,30})/i);
  const cmpMatch = text.match(/CMP\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);
  const tpMatch = text.match(/Price\s*Target\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);

  return {
    rating: ratingMatch ? ratingMatch[1].trim() : "",
    cmp: cmpMatch ? parseNumber(cmpMatch[1]) : 0,
    targetPrice: tpMatch ? parseNumber(tpMatch[1]) : 0,
  };
}

// ── Chunking ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 1200;   // chars (~400 tokens)
const CHUNK_OVERLAP = 150; // chars (~50 tokens)

function chunkText(text: string, reportId: string): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let pageNum = 1;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 50) {
      chunks.push({
        id: crypto.randomUUID(),
        reportId,
        text: slice,
        pageNum,
      });
    }
    start = end - CHUNK_OVERLAP;
    pageNum++;
  }

  return chunks;
}

// ── Main indexer ─────────────────────────────────────────────────────────────

export async function indexReports(
  onProgress?: (msg: string) => void
): Promise<{ indexed: number; skipped: number }> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const allMeta: ReportMeta[] = [];
  const allChunks: Chunk[] = [];
  let indexed = 0;
  let skipped = 0;

  // Walk analyst folders
  const analystFolders = await fs.readdir(REPORTS_BASE);

  for (const folder of analystFolders) {
    const folderPath = path.join(REPORTS_BASE, folder);
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(folderPath);
    const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

    for (const pdf of pdfs) {
      const filePath = path.join(folderPath, pdf);
      onProgress?.(`Indexing: ${folder}/${pdf}`);

      try {
        // PDF extraction is handled by scripts/extract-single.mjs (child process)
        // when called via the indexing script. This path is unused at runtime.
        const buffer = await fs.readFile(filePath);
        void buffer; // suppress unused warning — extraction done via child process
        const text: string = "";

        if (!text || text.length < 100) {
          skipped++;
          continue;
        }

        const id = crypto.randomUUID();
        const fromFilename = parseFilename(pdf, folder);
        const fromText = extractMetaFromText(text);

        const meta: ReportMeta = {
          id,
          analyst: fromFilename.analyst ?? folder,
          company: fromFilename.company ?? pdf,
          symbol: "",  // populated manually via management UI or future symbol-map
          reportType: fromFilename.reportType ?? "Other",
          date: fromFilename.date ?? new Date().toISOString().slice(0, 10),
          rating: fromText.rating,
          cmp: fromText.cmp,
          targetPrice: fromText.targetPrice,
          filePath,
        };

        allMeta.push(meta);
        allChunks.push(...chunkText(text, id));
        indexed++;
      } catch (err) {
        onProgress?.(`  SKIP (parse error): ${pdf} — ${err}`);
        skipped++;
      }
    }
  }

  await fs.writeFile(METADATA_PATH, JSON.stringify(allMeta, null, 2));
  await fs.writeFile(CHUNKS_PATH, JSON.stringify(allChunks, null, 2));

  return { indexed, skipped };
}

// ── Read helpers ─────────────────────────────────────────────────────────────

export async function readMetadata(): Promise<ReportMeta[]> {
  try {
    return JSON.parse(await fs.readFile(METADATA_PATH, "utf-8")) as ReportMeta[];
  } catch {
    return [];
  }
}

export async function readChunks(): Promise<Chunk[]> {
  try {
    return JSON.parse(await fs.readFile(CHUNKS_PATH, "utf-8")) as Chunk[];
  } catch {
    return [];
  }
}

// encodePdfPath lives in lib/reportTypes.ts (client-safe)
export { encodePdfPath } from "./reportTypes";
