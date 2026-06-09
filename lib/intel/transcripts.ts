import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { dateToQuarter, normalizeQuarter, quarterAddOffset } from "./quarters";

const _require = createRequire(import.meta.url);

// -- Quarter detection ---------------------------------------------------------

export function detectQuarterFromFilename(filename: string): string | null {
  const m = filename.match(/Q\s*([1-4])\s*-?\s*FY\s*(\d{2})/i);
  if (!m) return null;
  return `Q${m[1]}-FY${m[2]}`;
}

export function detectDateFromHeader(text: string): string | null {
  const m = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!m) return null;
  const months: Record<string, string> = {
    january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12",
  };
  return `${m[3]}-${months[m[1].toLowerCase()]}-${String(m[2]).padStart(2, "0")}`;
}

export function dateToQuarterLabel(iso: string): string {
  return dateToQuarter(iso);
}

/** Convert a call date to the quarter the call is REPORTING ON.
 *  Heuristic: subtract one quarter -- calls are held a few weeks after a quarter ends. */
export function reportingQuarterFromCallDate(iso: string): string {
  const callQ = dateToQuarter(iso);
  return quarterAddOffset(callQ, -1);
}

// -- PDF text extraction -------------------------------------------------------

const MIN_CHARS_PER_KB = 100;

// pdfjs-dist (used internally by pdf2json) writes diagnostic noise to console.warn.
// These are not errors -- filter them during PDF parsing so they don't flood the
// Next.js dev server log on every ingestion request.
const PDF_WARN_NOISE = /Setting up fake worker|TT: (undefined function|invalid function)|Unsupported: field\.type|NOT valid form element/;

function tryPdf2json(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const PDFParser = _require("pdf2json");
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && PDF_WARN_NOISE.test(args[0])) return;
      origWarn(...args);
    };
    const p = new PDFParser(null, 1);
    const restore = () => { console.warn = origWarn; };
    p.on("pdfParser_dataError", (err: unknown) => { restore(); reject(err); });
    p.on("pdfParser_dataReady", () => {
      restore();
      try {
        resolve(p.getRawTextContent());
      } catch {
        // fallback: reconstruct from page objects
        const data = p.data as { Pages?: { Texts?: { R?: { T?: string }[] }[] }[] };
        const text = data.Pages
          ?.flatMap((pg) => pg.Texts?.map((t) => decodeURIComponent(t.R?.[0]?.T ?? "")) ?? [])
          .join(" ") ?? "";
        resolve(text);
      }
    });
    p.loadPDF(pdfPath);
  });
}

function tryPython(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", ["scripts/extract-transcripts.py", pdfPath]);
    let out = "", err = "";
    proc.stdout.on("data", (d: Buffer) => out += d.toString());
    proc.stderr.on("data", (d: Buffer) => err += d.toString());
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve(out);
      else reject(new Error(`python extractor failed (${code}): ${err}`));
    });
    proc.on("error", reject);
  });
}

export async function extractPdfText(pdfPath: string): Promise<{ text: string; method: string }> {
  const stat = await fs.stat(pdfPath);
  const sizeKb = stat.size / 1024;

  let text = "";
  let method = "pdf2json";
  try {
    text = await tryPdf2json(pdfPath);
  } catch (e) {
    console.warn(`[transcripts] pdf2json failed on ${path.basename(pdfPath)}:`, e);
  }

  if (text.length < MIN_CHARS_PER_KB * sizeKb) {
    try {
      const pyText = await tryPython(pdfPath);
      if (pyText.length > text.length) {
        text = pyText;
        method = "pdfminer";
      }
    } catch (e) {
      console.warn(`[transcripts] python fallback failed on ${path.basename(pdfPath)}:`, e);
    }
  }
  return { text, method };
}

// -- Text cleaning -------------------------------------------------------------

const COVER_TRIGGERS = [/^Moderator\s*:/im, /^Operator\s*:/im, /Earnings Conference Call/i];

export function stripCoverLetter(text: string): string {
  for (const trig of COVER_TRIGGERS) {
    const m = text.match(trig);
    if (m && typeof m.index === "number") {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      return text.slice(lineStart);
    }
  }
  return text;
}

const FOOTER_PATTERNS = [
  /^Page\s+\d+\s+of\s+\d+$/i,
  /^\d+\s*\/\s*\d+$/,                // "3 / 12" style
  /^-+\s*\d+\s*-+$/,                 // "---- 5 ----" page numbers
];

export function stripRepeatingFooters(text: string): string {
  const lines = text.split(/\r?\n/);
  const counts = new Map<string, number>();
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (trimmed.length === 0 || trimmed.length > 80) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return lines.filter((ln) => {
    const t = ln.trim();
    if (FOOTER_PATTERNS.some((p) => p.test(t))) return false;
    return (counts.get(t) ?? 0) <= 3;
  }).join("\n");
}

// -- Ingest driver -------------------------------------------------------------

export interface TranscriptManifest {
  symbol: string;
  ingested: { quarter: string; sourcePath: string; method: string; chars: number }[];
  failed: { sourcePath: string; reason: string }[];
  duplicatesSkipped: { sourcePath: string; quarter: string; keptPath: string }[];
}

export interface IngestOptions {
  symbol: string;
  inputDir: string;
  outputDir: string;
  filenameFilter?: (name: string) => boolean;
}

const COMPANY_FINGERPRINTS: Record<string, RegExp[]> = {
  BAJAJFINSV: [/bajaj\s*finserv/i],
  HDFCBANK:   [/hdfc\s*bank\s*limited/i, /hdfc\s*bank/i],
};

function fingerprintMatches(symbol: string, text: string): boolean {
  return (COMPANY_FINGERPRINTS[symbol] ?? []).some((p) => p.test(text));
}

export async function ingestTranscripts(opts: IngestOptions): Promise<TranscriptManifest> {
  const manifest: TranscriptManifest = { symbol: opts.symbol, ingested: [], failed: [], duplicatesSkipped: [] };
  await fs.mkdir(opts.outputDir, { recursive: true });

  const files = (await fs.readdir(opts.inputDir))
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .filter((n) => opts.filenameFilter ? opts.filenameFilter(n) : true);

  type Item = { src: string; quarter: string | null; text: string; method: string };
  const items: Item[] = [];
  for (const name of files) {
    const src = path.join(opts.inputDir, name);
    try {
      const { text, method } = await extractPdfText(src);
      if (!fingerprintMatches(opts.symbol, text)) continue;
      let quarter = detectQuarterFromFilename(name);
      if (!quarter) {
        const callDate = detectDateFromHeader(text.slice(0, 4000));
        if (callDate) quarter = reportingQuarterFromCallDate(callDate);
      }
      items.push({ src, quarter, text, method });
    } catch (e) {
      manifest.failed.push({ sourcePath: src, reason: String(e) });
    }
  }

  const byQ: Record<string, Item[]> = {};
  for (const it of items) {
    if (!it.quarter) {
      manifest.failed.push({ sourcePath: it.src, reason: "could not detect quarter" });
      continue;
    }
    if (!byQ[it.quarter]) byQ[it.quarter] = [];
    byQ[it.quarter].push(it);
  }

  for (const [q, group] of Object.entries(byQ)) {
    group.sort((a, b) => b.text.length - a.text.length);
    const winner = group[0];
    for (const loser of group.slice(1)) {
      manifest.duplicatesSkipped.push({ sourcePath: loser.src, quarter: q, keptPath: winner.src });
    }
    const cleaned = stripRepeatingFooters(stripCoverLetter(winner.text)).trim();
    const outFile = path.join(opts.outputDir, `${q}.txt`);
    await fs.writeFile(outFile, cleaned, "utf-8");
    manifest.ingested.push({ quarter: q, sourcePath: winner.src, method: winner.method, chars: cleaned.length });
  }

  manifest.ingested.sort((a, b) => a.quarter.localeCompare(b.quarter));
  return manifest;
}
