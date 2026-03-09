/**
 * Single-PDF text extractor.
 * Strategy:
 *   1. pdftotext (Poppler) — fast native extraction for text-based PDFs
 *   2. Tesseract OCR fallback — for scanned/image-only PDFs
 *
 * Usage: node scripts/extract-single.mjs "path/to/file.pdf"
 * Outputs one JSON line to stdout: { ok, text, method } or { ok, error }
 */
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const PDFTOTEXT =
  "C:\\Users\\SSFL-RETAIL-017\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftotext.exe";

const PDFTOPPM =
  "C:\\Users\\SSFL-RETAIL-017\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe";

const TESSERACT = "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";

const MIN_NATIVE_CHARS = 200; // below this → treat as scanned, try OCR
const OCR_DPI = 200;          // dpi for pdftoppm rasterisation

const filePath = process.argv[2];

if (!filePath) {
  process.stdout.write(JSON.stringify({ ok: false, error: "no path" }) + "\n");
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 32 * 1024 * 1024, timeout: 60000, ...opts },
      (err, stdout, stderr) => {
        if (err) reject(Object.assign(err, { stderr }));
        else resolve(stdout);
      });
  });
}

// ── 1. Native extraction via pdftotext ───────────────────────────────────────

async function extractNative(pdf) {
  // pdftotext -layout pdf - → prints to stdout
  const text = await run(PDFTOTEXT, ["-layout", "-enc", "UTF-8", pdf, "-"]);
  return text.trim();
}

// ── 2. OCR fallback via pdftoppm + tesseract ─────────────────────────────────

async function extractOCR(pdf) {
  const tmpDir = path.join(os.tmpdir(), `ocr-${crypto.randomUUID()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Convert PDF pages to PPM images
    await run(PDFTOPPM, ["-r", String(OCR_DPI), "-png", pdf, path.join(tmpDir, "page")]);

    const pages = (await fs.readdir(tmpDir))
      .filter(f => f.endsWith(".png"))
      .sort();

    if (pages.length === 0) return "";

    const parts = [];
    for (const page of pages) {
      const imgPath = path.join(tmpDir, page);
      // tesseract image stdout → text on stdout
      const txt = await run(TESSERACT, [imgPath, "stdout", "-l", "eng", "--psm", "3"]);
      parts.push(txt.trim());
    }

    return parts.join("\n\n");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

try {
  let text = "";
  let method = "pdftotext";

  try {
    text = await extractNative(filePath);
  } catch (e) {
    // pdftotext failed entirely — fall straight to OCR
    text = "";
  }

  if (text.length < MIN_NATIVE_CHARS) {
    // Too little native text → scanned PDF, use Tesseract
    method = "tesseract";
    text = await extractOCR(filePath);
  }

  process.stdout.write(JSON.stringify({ ok: true, text, method }) + "\n");
  process.exit(0);
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err) }) + "\n");
  process.exit(1);
}
