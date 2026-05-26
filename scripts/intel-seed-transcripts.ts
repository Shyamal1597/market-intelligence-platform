/**
 * scripts/intel-seed-transcripts.ts
 *
 * Download historical earnings call transcripts from BSE for tracked symbols.
 * Downloads PDFs, extracts text, saves transcripts. Does NOT run the LLM pipeline.
 *
 * Usage:
 *   npx tsx scripts/intel-seed-transcripts.ts                      # All tracked symbols
 *   npx tsx scripts/intel-seed-transcripts.ts HDFCBANK BAJAJFINSV  # Specific symbols
 *   npx tsx scripts/intel-seed-transcripts.ts --from=2024-04-01    # Custom start date
 */

import {
  fetchHistoricalTranscripts,
  SYMBOL_TO_SCRIP,
} from "@/lib/intel/bse-transcript-scraper";
import { ingestPdfTranscript } from "@/lib/intel/pipeline";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import https from "node:https";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BSE_ATTACH_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";
const MAX_PDF_SIZE = 20 * 1024 * 1024;

/** Download PDF using lenient HTTP parser (BSE sends malformed headers) */
function downloadPdf(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Download timed out")), 60_000);
    const req = https.get(url, {
      headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" },
      insecureHTTPParser: true,
    }, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_PDF_SIZE) {
          clearTimeout(timer);
          reject(new Error(`PDF too large: ${size} bytes`));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      res.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const symbols: string[] = [];
let fromDate: Date | null = null;

for (const arg of args) {
  if (arg.startsWith("--from=")) {
    fromDate = new Date(arg.split("=")[1]);
  } else if (!arg.startsWith("--")) {
    symbols.push(arg.toUpperCase());
  }
}

const targetSymbols = symbols.length > 0
  ? symbols.filter((s) => SYMBOL_SECTOR[s])
  : Object.keys(SYMBOL_SECTOR);

if (targetSymbols.length === 0) {
  console.error("No valid symbols found.");
  process.exit(1);
}

// Default: 18 months back (covers 5-6 quarters)
const startDate = fromDate ?? new Date();
if (!fromDate) startDate.setMonth(startDate.getMonth() - 18);

console.log(`Seeding transcripts for ${targetSymbols.length} symbol(s)`);
console.log(`Date range: ${startDate.toISOString().slice(0, 10)} → now\n`);

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let totalDownloaded = 0;
  let totalIngested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let noScripCount = 0;

  for (const symbol of targetSymbols) {
    const scripCodes = SYMBOL_TO_SCRIP[symbol];
    if (!scripCodes || scripCodes.length === 0) {
      noScripCount++;
      continue;
    }

    process.stdout.write(`[${symbol}] `);

    for (const scrip of scripCodes) {
      let transcriptFilings;
      try {
        transcriptFilings = await fetchHistoricalTranscripts(scrip, startDate);
      } catch (e) {
        console.log(`BSE error: ${(e as Error).message}`);
        totalErrors++;
        continue;
      }

      if (transcriptFilings.length === 0) {
        console.log("no transcript filings found");
        continue;
      }

      console.log(`${transcriptFilings.length} filing(s)`);

      for (const filing of transcriptFilings) {
        const attachment = filing.ATTACHMENTNAME?.trim();
        if (!attachment) continue;

        const pdfUrl = `${BSE_ATTACH_BASE}${encodeURIComponent(attachment)}`;
        try {
          const parsedUrl = new URL(pdfUrl);
          if (parsedUrl.hostname !== "www.bseindia.com") continue;
        } catch { continue; }

        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await downloadPdf(pdfUrl);
          totalDownloaded++;
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("HTTP 404")) {
            // Expected for old filings — BSE purges attachments after ~2 months
            continue;
          }
          console.log(`    Download failed: ${msg}`);
          totalErrors++;
          continue;
        }

        try {
          const result = await ingestPdfTranscript(pdfBuffer, symbol, attachment);
          if (result.alreadyExisted) {
            process.stdout.write(`  ${result.quarter}(exists)`);
            totalSkipped++;
          } else {
            process.stdout.write(`  ${result.quarter}(${result.chars}c)`);
            totalIngested++;
          }
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("0 chars")) {
            process.stdout.write("  (scanned-pdf)");
          } else {
            process.stdout.write(`  (err:${msg.slice(0, 40)})`);
          }
          totalErrors++;
        }
      }
      console.log(); // newline after all filings for this symbol
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Seeding complete.`);
  console.log(`  Symbols processed: ${targetSymbols.length - noScripCount} (${noScripCount} without scrip codes)`);
  console.log(`  Downloaded:        ${totalDownloaded} PDFs`);
  console.log(`  Ingested:          ${totalIngested} new transcripts`);
  console.log(`  Skipped:           ${totalSkipped} (already existed)`);
  console.log(`  Errors:            ${totalErrors}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
