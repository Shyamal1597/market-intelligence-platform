/**
 * scripts/intel-seed-screener.ts
 *
 * Download earnings call transcripts from Screener.in for tracked symbols.
 * Screener.in is publicly accessible -- NO login or cookie required.
 * Transcript links point to BSE historical archive PDFs (AttachHis).
 *
 * Usage:
 *   npx tsx scripts/intel-seed-screener.ts                              # 35 priority stocks, Q3+Q4-FY26
 *   npx tsx scripts/intel-seed-screener.ts SBIN RELIANCE                # specific symbols
 *   npx tsx scripts/intel-seed-screener.ts --quarters=Q3-FY26           # specific quarter
 *   npx tsx scripts/intel-seed-screener.ts --quarters=Q3-FY26,Q4-FY26  # multiple quarters
 *   npx tsx scripts/intel-seed-screener.ts --all-missing                # all 100 NIFTY stocks
 *   npx tsx scripts/intel-seed-screener.ts --dry-run                    # print URLs, no download
 *
 * Default target: Q3-FY26 + Q4-FY26 for the 34 stocks with Q4-FY26 only, plus CANBK.
 */

import https from "node:https";
import { load as cheerioLoad } from "cheerio";
import { ingestPdfTranscript } from "@/lib/intel/pipeline";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

// -- Config --------------------------------------------------------------------

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const SCREENER_BASE = "https://www.screener.in";
const DELAY_MS = 1200; // polite delay between requests

/**
 * NSE symbol → Screener.in URL slug (only overrides needed).
 * Most symbols match directly. Symbols with special chars (&) are
 * URL-encoded at request time so no override needed for those.
 */
const SCREENER_SLUG: Record<string, string> = {
  // No overrides currently needed -- special chars are encoded in fetchConcalls
};

// -- Quarter helpers -----------------------------------------------------------

/**
 * Convert a Screener.in concall month label to our quarter key.
 * Screener shows the *publication* month, not the quarter period.
 *
 *   Feb YYYY → Q3-FY{YY}    (Oct-Dec YYYY-1 results, published Jan/Feb)
 *   May YYYY → Q4-FY{YY}    (Jan-Mar YYYY results,   published Apr/May)
 *   Aug YYYY → Q1-FY{YY+1}  (Apr-Jun YYYY results,   published Jul/Aug)
 *   Nov YYYY → Q2-FY{YY+1}  (Jul-Sep YYYY results,   published Oct/Nov)
 *   Jan/Mar  → treated as Q3 (early/late Q3 season)
 *   Apr/Jun  → treated as Q4
 *   Jul/Sep  → treated as Q1
 *   Oct/Dec  → treated as Q2
 */
function labelToQuarter(label: string): string | null {
  const m = label.trim().match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[2]);
  const mo = new Date(`${m[1]} 1 ${year}`).getMonth() + 1; // 1-12
  if (isNaN(mo)) return null;

  let q: number;
  let fy: number;
  if (mo <= 3) {            // Jan-Mar: Q3 season, FY ends this year
    q = 3; fy = year % 100;
  } else if (mo <= 6) {    // Apr-Jun: Q4 season, FY ends this year
    q = 4; fy = year % 100;
  } else if (mo <= 9) {    // Jul-Sep: Q1 season, FY ends next year
    q = 1; fy = (year + 1) % 100;
  } else {                  // Oct-Dec: Q2 season, FY ends next year
    q = 2; fy = (year + 1) % 100;
  }
  return `Q${q}-FY${String(fy).padStart(2, "0")}`;
}

// -- HTTP helpers --------------------------------------------------------------

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), 30_000);
    const fullUrl = url.startsWith("http") ? url : `${SCREENER_BASE}${url}`;
    https.get(fullUrl, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      insecureHTTPParser: true,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        clearTimeout(timer);
        fetchHtml(res.headers.location ?? "").then(resolve).catch(reject);
        res.resume(); return;
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume(); return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString("utf-8")); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    }).on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

function fetchPdf(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), 60_000);
    https.get(url, {
      headers: { "User-Agent": UA, Referer: "https://www.screener.in/" },
      insecureHTTPParser: true,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        clearTimeout(timer);
        fetchPdf(res.headers.location ?? "").then(resolve).catch(reject);
        res.resume(); return;
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume(); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_PDF_BYTES) { clearTimeout(timer); reject(new Error("PDF too large")); res.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    }).on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// -- Screener parsing ----------------------------------------------------------

interface ConcallEntry {
  label: string;          // e.g. "Feb 2026"
  quarter: string;        // e.g. "Q3-FY26"
  transcriptUrl: string;  // direct BSE PDF URL
}

async function fetchConcalls(symbol: string): Promise<ConcallEntry[]> {
  const slug = SCREENER_SLUG[symbol] ?? symbol;
  // encodeURIComponent handles symbols like M&M → M%26M, BAJAJ-AUTO → BAJAJ-AUTO
  const html = await fetchHtml(`/company/${encodeURIComponent(slug)}/`);
  const $ = cheerioLoad(html);
  const entries: ConcallEntry[] = [];
  const seen = new Set<string>();

  // Find the concalls block -- it's a <ul class="list-links"> inside a div near h3 "Concalls"
  // Each <li> has: <div style="width: 74px">DATE</div> + <a title="Raw Transcript" href="...">

  // Walk every <li> that contains a "Raw Transcript" link
  $("li").each(function () {
    const $li = $(this);
    const transcriptAnchor = $li.find('a[title="Raw Transcript"]');
    if (transcriptAnchor.length === 0) return;

    const pdfUrl = transcriptAnchor.attr("href") ?? "";
    if (!pdfUrl.endsWith(".pdf") && !pdfUrl.includes("pdf")) return;

    // Date label: first <div> with numeric year in text
    let label = "";
    $li.find("div").each(function () {
      const txt = $(this).text().trim();
      if (/\d{4}/.test(txt) && /[A-Za-z]/.test(txt)) { label = txt; return false; }
    });
    if (!label) return;

    const quarter = labelToQuarter(label);
    if (!quarter || seen.has(quarter)) return;
    seen.add(quarter);
    entries.push({ label, quarter, transcriptUrl: pdfUrl });
  });

  return entries;
}

// -- Args ----------------------------------------------------------------------

const args = process.argv.slice(2);
const symbols: string[] = [];
let targetQuarters = ["Q3-FY26", "Q4-FY26"];
let dryRun = false;
let allMissing = false;

for (const arg of args) {
  if (arg.startsWith("--quarters="))   targetQuarters = arg.split("=")[1].split(",").map((q) => q.trim().toUpperCase());
  else if (arg === "--dry-run")        dryRun = true;
  else if (arg === "--all-missing")    allMissing = true;
  else if (!arg.startsWith("--"))      symbols.push(arg.toUpperCase());
}

// Default: Q4-only stocks (need Q3-FY26) + CANBK (needs Q4-FY26)
const Q4_ONLY = [
  "SBIN","BANKBARODA","UNIONBANK","PNB","SBILIFE","BAJFINANCE","MUTHOOTFIN","M&MFIN",
  "SUNPHARMA","DRREDDY","DIVISLAB","ZYDUSLIFE","M&M","BAJAJ-AUTO","EICHERMOT","HYUNDAI",
  "VBL","UNITDSPR","RELIANCE","TATAPOWER","ADANIENSOL","ADANIGREEN","JSWSTEEL","TATASTEEL",
  "BHARTIARTL","ULTRACEMCO","AMBUJACEM","PIDILITIND","LT","ADANIENT","TITAN","ETERNAL",
  "DLF","LODHA",
];

let targetSymbols: string[];
if (symbols.length > 0)    targetSymbols = symbols.filter((s) => SYMBOL_SECTOR[s] !== undefined);
else if (allMissing)       targetSymbols = Object.keys(SYMBOL_SECTOR);
else                       targetSymbols = [...Q4_ONLY, "CANBK"];

// -- Main ----------------------------------------------------------------------

async function main() {
  console.log(`Screener transcript seeder (no auth required)`);
  console.log(`  Symbols:  ${targetSymbols.length}`);
  console.log(`  Quarters: ${targetQuarters.join(", ")}`);
  if (dryRun) console.log(`  DRY RUN -- no downloads or writes\n`);
  console.log();

  let ingested = 0, skipped = 0, errors = 0, notFound = 0;

  for (const symbol of targetSymbols) {
    process.stdout.write(`[${symbol}] `);

    // Fetch Screener concall list
    let concalls: ConcallEntry[];
    try {
      concalls = await fetchConcalls(symbol);
    } catch (e) {
      console.log(`screener-err: ${(e as Error).message}`);
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    // Filter to target quarters
    const wanted = concalls.filter((c) => targetQuarters.includes(c.quarter));

    if (wanted.length === 0) {
      const avail = concalls.map((c) => c.quarter).join(", ") || "none";
      console.log(`no match (available: ${avail})`);
      notFound++;
      await sleep(DELAY_MS);
      continue;
    }

    for (const entry of wanted) {
      if (dryRun) {
        process.stdout.write(`  ${entry.quarter}(dry: ${entry.transcriptUrl.slice(-40)})`);
        continue;
      }

      // Download PDF
      let pdf: Buffer;
      try {
        pdf = await fetchPdf(entry.transcriptUrl);
      } catch (e) {
        process.stdout.write(`  ${entry.quarter}(dl-err:${(e as Error).message.slice(0, 25)})`);
        errors++;
        continue;
      }

      // Verify it's actually a PDF
      if (pdf.slice(0, 4).toString("ascii") !== "%PDF") {
        process.stdout.write(`  ${entry.quarter}(not-pdf)`);
        errors++;
        continue;
      }

      // Ingest through pipeline (PDF → text → save .txt)
      try {
        const result = await ingestPdfTranscript(pdf, symbol, `screener-${symbol}-${entry.quarter}.pdf`);
        if (result.alreadyExisted) {
          process.stdout.write(`  ${entry.quarter}(exists)`);
          skipped++;
        } else {
          process.stdout.write(`  ${entry.quarter}(${result.chars}c)`);
          ingested++;
        }
      } catch (e) {
        const msg = (e as Error).message;
        process.stdout.write(`  ${entry.quarter}(${msg.includes("0 chars") ? "scanned-pdf" : "ingest-err:" + msg.slice(0, 25)})`);
        errors++;
      }
    }

    console.log();
    await sleep(DELAY_MS);
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Done.`);
  console.log(`  Ingested:  ${ingested} new transcripts`);
  console.log(`  Skipped:   ${skipped} (already existed)`);
  console.log(`  Not found: ${notFound} (quarter not on Screener)`);
  console.log(`  Errors:    ${errors}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
