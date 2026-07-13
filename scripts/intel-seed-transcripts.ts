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
import { fetchScreenerConcalls, displayDateToQuarter } from "@/lib/intel/screener-scraper";
import { ingestPdfTranscript } from "@/lib/intel/pipeline";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import https from "node:https";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BSE_ATTACH_LIVE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";
const BSE_ATTACH_HIS  = "https://www.bseindia.com/xml-data/corpfiling/AttachHis/";
const MAX_PDF_SIZE = 20 * 1024 * 1024;
// Minimum characters for a PDF to be considered a real transcript (not a short
// press release, agenda, or other non-transcript filing from BSE).
const MIN_USEFUL_CHARS = 5_000;

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
      res.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        // BSE sometimes returns HTTP 200 with an HTML error page for purged attachments.
        // Detect by checking PDF magic bytes (%PDF) at the start of the buffer.
        if (buf.length < 5 || buf.slice(0, 4).toString("ascii") !== "%PDF") {
          reject(new Error("HTTP 404")); // treat as soft-404
          return;
        }
        resolve(buf);
      });
      res.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// -- Parse args --------------------------------------------------------------
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

// --only-screener: skip BSE entirely, go straight to Screener.
// Use when a symbol already has some real BSE transcripts but is missing
// quarters that BSE never had (e.g. junk filings blocked Screener previously).
const onlyScreener = args.includes("--only-screener");

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

// -- Main --------------------------------------------------------------------
async function main() {
  let totalDownloaded = 0;
  let totalIngested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let noScripCount = 0;

  for (const symbol of targetSymbols) {
    const scripCodes = SYMBOL_TO_SCRIP[symbol] ?? [];

    if (scripCodes.length === 0) {
      noScripCount++;
      // No scrip codes -- fall through to Screener fallback below
    }

    process.stdout.write(`[${symbol}] `);

    // Track how many transcript filings BSE actually returned (not just whether scrip
    // codes exist). A symbol can have scrip codes but BSE may only have audio filings,
    // in which case Screener should be tried.
    let bseFilingsFound = 0;
    // Count of BSE transcripts that are substantial enough to be real transcripts.
    // BSE sometimes returns short press releases/agendas (<5k chars) -- these are junk
    // and should trigger the Screener fallback even though BSE technically "had filings".
    let bseUsefulIngested = 0;

    if (onlyScreener) {
      // Skip BSE entirely -- jump straight to Screener below.
      // bseFilingsFound stays 0 so the Screener block always runs.
      console.log("(--only-screener: skipping BSE)");
    }

    for (const scrip of scripCodes.filter(() => !onlyScreener)) {
      let transcriptFilings;
      try {
        transcriptFilings = await fetchHistoricalTranscripts(scrip, startDate);
      } catch (e) {
        process.stdout.write(`BSE error: ${(e as Error).message}\n`);
        totalErrors++;
        continue;
      }

      if (transcriptFilings.length === 0) continue;

      bseFilingsFound += transcriptFilings.length;
      process.stdout.write(`${transcriptFilings.length} BSE filing(s)\n`);

      for (const filing of transcriptFilings) {
        const attachment = filing.ATTACHMENTNAME?.trim();
        if (!attachment) continue;

        // Try AttachLive first (recent), fall back to AttachHis (permanent archive)
        const encoded = encodeURIComponent(attachment);
        const liveUrl = `${BSE_ATTACH_LIVE}${encoded}`;
        const hisUrl  = `${BSE_ATTACH_HIS}${encoded}`;
        try {
          const parsedUrl = new URL(liveUrl);
          if (parsedUrl.hostname !== "www.bseindia.com") continue;
        } catch { continue; }

        let pdfBuffer: Buffer;
        try {
          // Try AttachLive first, fall back to AttachHis for older filings
          let dlError = "";
          try {
            pdfBuffer = await downloadPdf(liveUrl);
          } catch (e1) {
            dlError = (e1 as Error).message;
            if (!dlError.includes("HTTP 404")) throw e1; // non-404 -- don't retry
            pdfBuffer = await downloadPdf(hisUrl);       // retry from archive
          }
          totalDownloaded++;
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("HTTP 404")) {
            // Not in live or archive -- filing genuinely missing
            continue;
          }
          process.stdout.write(`    Download failed: ${msg}\n`);
          totalErrors++;
          continue;
        }

        try {
          const result = await ingestPdfTranscript(pdfBuffer, symbol, attachment, undefined, "bse");
          if (result.alreadyExisted) {
            process.stdout.write(`  ${result.quarter}(exists)`);
            if (result.chars >= MIN_USEFUL_CHARS) bseUsefulIngested++;
            totalSkipped++;
          } else {
            process.stdout.write(`  ${result.quarter}(${result.chars}c)`);
            if (result.chars >= MIN_USEFUL_CHARS) bseUsefulIngested++;
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
      console.log(); // newline after all filings for this scrip
    }

    // -- Screener supplement ----------------------------------------------------
    // Always runs (unless --no-screener) to catch quarters BSE missed.
    // BSE is not a reliable source for the LATEST transcript -- companies often
    // file under subcategories we don't query, or BSE purges recent attachments.
    // Screener aggregates from multiple sources and consistently has the latest.
    // Existing quarters are skipped via alreadyExisted, so this is additive.
    if (!args.includes("--no-screener")) {
      let screenerConcalls: Awaited<ReturnType<typeof fetchScreenerConcalls>> = [];
      try {
        screenerConcalls = await fetchScreenerConcalls(symbol);
      } catch (e) {
        process.stdout.write(`  [Screener fetch failed: ${(e as Error).message.slice(0, 60)}]\n`);
      }

      if (screenerConcalls.length === 0 && bseFilingsFound === 0) {
        console.log("no transcript filings found (BSE + Screener)");
        continue;
      }

      if (screenerConcalls.length > 0) {
        console.log(`${screenerConcalls.length} filing(s) via Screener`);
        for (const concall of screenerConcalls) {
          let pdfBuffer: Buffer;
          try {
            pdfBuffer = await downloadPdf(concall.pdfUrl);
            totalDownloaded++;
          } catch (e) {
            // Log failures -- silent skips mask real problems (e.g. latest quarter unavailable)
            process.stdout.write(`  [Screener DL failed ${concall.displayDate}: ${(e as Error).message.slice(0, 50)}]\n`);
            totalErrors++;
            continue;
          }

          const fakeName = `screener-${symbol}-${concall.displayDate.replace(/\s/g, "-")}.pdf`;
          const screenerQtr = displayDateToQuarter(concall.displayDate) ?? undefined;
          try {
            const result = await ingestPdfTranscript(pdfBuffer, symbol, fakeName, screenerQtr, "screener");
            if (result.alreadyExisted) {
              process.stdout.write(`  ${result.quarter}(exists)`);
              totalSkipped++;
            } else {
              process.stdout.write(`  ${result.quarter}(${result.chars}c)`);
              totalIngested++;
            }
          } catch (e) {
            const msg = (e as Error).message;
            process.stdout.write(msg.includes("0 chars") ? "  (scanned-pdf)" : `  (err:${msg.slice(0, 50)})`);
            totalErrors++;
          }
        }
        console.log();
      }
    } else if (bseUsefulIngested === 0 && scripCodes.length > 0) {
      console.log("no useful transcript filings found (BSE filings were too short)");
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Seeding complete.`);
  console.log(`  Symbols processed: ${targetSymbols.length} (${noScripCount} without BSE scrip codes -- Screener tried)`);
  console.log(`  Downloaded:        ${totalDownloaded} PDFs`);
  console.log(`  Ingested:          ${totalIngested} new transcripts`);
  console.log(`  Skipped:           ${totalSkipped} (already existed)`);
  console.log(`  Errors:            ${totalErrors}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
