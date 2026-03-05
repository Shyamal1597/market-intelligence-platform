/**
 * Single-PDF text extractor using pdf2json (pure JS, no WASM).
 * Spawned as a child process per PDF to keep memory isolated.
 * Usage: node scripts/extract-single.mjs "path/to/file.pdf"
 * Outputs: JSON { ok, text } to stdout
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

const filePath = process.argv[2];
if (!filePath) {
  process.stdout.write(JSON.stringify({ ok: false, error: "no path" }));
  process.exit(1);
}

const parser = new PDFParser(null, 1 /* raw text mode */);

parser.on("pdfParser_dataReady", (data) => {
  try {
    const text = (data.Pages ?? [])
      .flatMap((page) => page.Texts ?? [])
      .map((t) => decodeURIComponent(t.R?.map((r) => r.T ?? "").join("") ?? ""))
      .join(" ");
    process.stdout.write(JSON.stringify({ ok: true, text }));
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(err) }));
    process.exit(1);
  }
});

parser.on("pdfParser_dataError", (errData) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(errData.parserError ?? errData) }));
  process.exit(1);
});

parser.loadPDF(filePath);
