/**
 * Single-PDF text extractor using pdf2json (pure JS, no WASM).
 * Usage: node scripts/extract-single.mjs "path/to/file.pdf"
 * Outputs ONLY a single JSON line to stdout: { ok, text } or { ok, error }
 */
import { createRequire } from "module";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

const filePath = process.argv[2];

// Write result to a temp file then print path — avoids pdf2json stdout pollution
const tmpFile = path.join(os.tmpdir(), `pdf-extract-${crypto.randomUUID()}.json`);

// Catch-all: if process exits without writing result, write error to temp file
process.on("uncaughtException", async (err) => {
  try { await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: String(err) })); } catch {}
  process.stdout.write(tmpFile + "\n");
  process.exit(1);
});

process.on("unhandledRejection", async (err) => {
  try { await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: String(err) })); } catch {}
  process.stdout.write(tmpFile + "\n");
  process.exit(1);
});

if (!filePath) {
  await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: "no path" }));
  process.stdout.write(tmpFile + "\n");
  process.exit(1);
}

// Suppress all console output — pdf2json writes warnings (e.g. "Warning: TT:
// undefined function") to stdout which would corrupt JSON parsing in the parent.
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;
console.info = noop;
console.debug = noop;

const parser = new PDFParser(null, 1 /* raw text mode */);

parser.on("pdfParser_dataReady", async (data) => {
  try {
    const text = (data.Pages ?? [])
      .flatMap((page) => page.Texts ?? [])
      .map((t) => { try { return decodeURIComponent(t.R?.map((r) => r.T ?? "").join("") ?? ""); } catch { return t.R?.map((r) => r.T ?? "").join("") ?? ""; } })
      .join(" ");
    await fs.writeFile(tmpFile, JSON.stringify({ ok: true, text }));
    process.stdout.write(tmpFile + "\n");
    process.exit(0);
  } catch (err) {
    await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: String(err) }));
    process.stdout.write(tmpFile + "\n");
    process.exit(1);
  }
});

parser.on("pdfParser_dataError", async (errData) => {
  await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: String(errData.parserError ?? errData) }));
  process.stdout.write(tmpFile + "\n");
  process.exit(1);
});

try {
  parser.loadPDF(filePath);
} catch (err) {
  await fs.writeFile(tmpFile, JSON.stringify({ ok: false, error: String(err) }));
  process.stdout.write(tmpFile + "\n");
  process.exit(1);
}
