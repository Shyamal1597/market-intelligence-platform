/**
 * Single-PDF text extractor — spawned as a child process per PDF.
 * Usage: node scripts/extract-single.mjs "path/to/file.pdf"
 * Outputs: JSON { ok, text } to stdout, then exits (freeing all memory).
 */
import { promises as fs } from "fs";

const filePath = process.argv[2];
if (!filePath) {
  process.stdout.write(JSON.stringify({ ok: false, error: "no path" }));
  process.exit(1);
}

try {
  const { extractText } = await import("unpdf");
  const buffer = await fs.readFile(filePath);
  const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: true });
  const text = Array.isArray(pages) ? pages.join("\n") : (pages ?? "");
  process.stdout.write(JSON.stringify({ ok: true, text }));
  process.exit(0);
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
