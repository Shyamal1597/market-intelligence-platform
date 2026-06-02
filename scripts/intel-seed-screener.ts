/**
 * scripts/intel-seed-screener.ts
 *
 * Download earnings call transcripts from Screener.in for tracked symbols.
 * Screener aggregates concall transcript links (pointing to BSE/IR PDFs).
 *
 * REQUIRES: SCREENER_COOKIE env var with your logged-in Screener.in session.
 *   How to get it: Open DevTools → Application → Cookies → screener.in
 *                  Copy "sessionid" and "csrftoken" values.
 *
 * Usage:
 *   SCREENER_COOKIE="sessionid=xxx; csrftoken=yyy" npx tsx scripts/intel-seed-screener.ts
 *   SCREENER_COOKIE="..." npx tsx scripts/intel-seed-screener.ts SBIN RELIANCE
 *   SCREENER_COOKIE="..." npx tsx scripts/intel-seed-screener.ts --quarters=Q3-FY26
 *   SCREENER_COOKIE="..." npx tsx scripts/intel-seed-screener.ts --quarters=Q3-FY26,Q4-FY26 SBIN RELIANCE
 *
 * If no --quarters specified: downloads Q3-FY26 and Q4-FY26 (the two most useful quarters).
 * If no symbols specified: runs for all symbols that currently have Q4-FY26 only (34 stocks).
 */

import https from "node:https";
import path from "node:path";
import { promises as fs } from "node:fs";
import { load as cheerioLoad } from "cheerio";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioSel = any; // CheerioSel — avoid version-specific type import
import { ingestPdfTranscript } from "@/lib/intel/pipeline";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

// ── Config ───────────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const SCREENER_BASE = "https://www.screener.in";

// NSE symbol → Screener.in URL slug (only overrides needed; most symbols match)
const SCREENER_SLUG: Record<string, string> = {
  "M&M":       "MM",
  "M&MFIN":    "M-AND-MFIN",
  "BAJAJ-AUTO":"BAJAJ-AUTO",
};

// ── Quarter helpers ───────────────────────────────────────────────────────────

/**
 * Map a Screener.in concall date string to our quarter format.
 * Screener shows the month results were *published*, not the quarter period.
 *
 * Feb YYYY  → Q3-FY{YY}   (Oct–Dec YYYY-1, published Jan/Feb YYYY)
 * May YYYY  → Q4-FY{YY}   (Jan–Mar YYYY,   published Apr/May YYYY)
 * Aug YYYY  → Q1-FY{YY+1} (Apr–Jun YYYY,   published Jul/Aug YYYY)
 * Nov YYYY  → Q2-FY{YY+1} (Jul–Sep YYYY,   published Oct/Nov YYYY)
 *
 * Also handles loose variants: "January 2026", "March 2026" etc.
 */
function screenerDateToQuarter(dateStr: string): string | null {
  const m = dateStr.trim().match(/(\w+)\s+(\d{4})/);
  if (!m) return null;
  const [, monthStr, yearStr] = m;
  const year = parseInt(yearStr);
  const month = new Date(`${monthStr} 1, ${year}`).getMonth() + 1; // 1-12
  if (isNaN(month)) return null;

  // Feb (2) or Jan/Mar loosely
  if (month <= 3) {
    const fy = year % 100;
    const q = month === 2 ? 3 : month === 1 ? 3 : 4;
    return `Q${q}-FY${String(fy).padStart(2, "0")}`;
  }
  // May (5) or Apr/Jun loosely
  if (month <= 6) {
    const fy = year % 100;
    return `Q4-FY${String(fy).padStart(2, "0")}`;
  }
  // Aug (8) or Jul/Sep loosely
  if (month <= 9) {
    const fy = (year + 1) % 100;
    return `Q1-FY${String(fy).padStart(2, "0")}`;
  }
  // Nov (11) or Oct/Dec loosely
  const fy = (year + 1) % 100;
  return `Q2-FY${String(fy).padStart(2, "0")}`;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchUrl(url: string, cookie: string, accept = "text/html"): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), 30_000);
    const isAbsolute = url.startsWith("http");
    const fullUrl = isAbsolute ? url : `${SCREENER_BASE}${url}`;
    const parsedUrl = new URL(fullUrl);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": accept,
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookie,
        "Referer": SCREENER_BASE + "/",
      },
      insecureHTTPParser: true,
    };

    const req = https.get(options, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        clearTimeout(timer);
        fetchUrl(res.headers.location, cookie, accept).then(resolve).catch(reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode} for ${fullUrl}`));
        res.resume();
        return;
      }

      const isBinary = accept.includes("application/pdf") || accept === "*/*";
      const chunks: Buffer[] = [];
      let size = 0;

      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_PDF_SIZE) {
          clearTimeout(timer);
          reject(new Error(`Response too large: ${size} bytes`));
          res.destroy();
          return;
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        resolve(isBinary ? buf : buf.toString("utf-8"));
      });
      res.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Screener parsing ──────────────────────────────────────────────────────────

interface ConcallEntry {
  dateLabel: string;    // e.g. "Feb 2026"
  quarter: string;      // e.g. "Q3-FY26"
  transcriptUrl: string | null;
}

/**
 * Fetch Screener Documents page and extract concall transcript links.
 */
async function fetchScreenerConcalls(symbol: string, cookie: string): Promise<ConcallEntry[]> {
  const slug = SCREENER_SLUG[symbol] ?? symbol;
  const url = `${SCREENER_BASE}/company/${slug}/`;

  let html: string;
  try {
    html = await fetchUrl(url, cookie) as string;
  } catch (e) {
    throw new Error(`Screener fetch failed: ${(e as Error).message}`);
  }

  if (html.includes("Log In") && html.includes("login") && !html.includes("concall")) {
    throw new Error("Screener returned login page — cookie may be expired or missing");
  }

  const $ = cheerioLoad(html);
  const entries: ConcallEntry[] = [];

  // Screener's concalls section: look for section with id/data matching "concalls"
  // or a heading with text "Concalls". Structure:
  //   <section id="concalls"> or <div class="concalls"> or similar
  //   Each row: <li> or <tr> with a date and links

  // Strategy 1: find a section/div around "Concalls" heading
  let concallSection: CheerioSel = $("[id*='concall'], [class*='concall'], #documents-concalls").first() as CheerioSel;

  // Strategy 2: search for the heading
  if (concallSection.length === 0) {
    $("h2, h3, h4, th, .sub-heading").each((_, el) => {
      if ($(el).text().trim().toLowerCase().includes("concall")) {
        concallSection = $(el).closest("section, div, table").first() as CheerioSel;
        return false;
      }
    });
  }

  // Strategy 3: look for any anchor with text "Transcript"
  if (concallSection.length === 0) {
    // Find the containing element of transcript links
    const firstTranscriptLink = $("a").filter((_, el) =>
      $(el).text().trim().toLowerCase() === "transcript"
    ).first();
    if (firstTranscriptLink.length) {
      concallSection = firstTranscriptLink.closest("section, div.documents, ul, table").first() as CheerioSel;
    }
  }

  // Now parse entries from the section
  const processRow = (dateText: string, $row: ReturnType<typeof $>) => {
    const quarter = screenerDateToQuarter(dateText);
    if (!quarter) return;

    // Find Transcript link in the same row
    let transcriptUrl: string | null = null;
    $row.find("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text === "transcript" || text === "transcript pdf") {
        const href = $(el).attr("href");
        if (href) {
          transcriptUrl = href.startsWith("http") ? href : `${SCREENER_BASE}${href}`;
        }
        return false;
      }
    });

    entries.push({ dateLabel: dateText, quarter, transcriptUrl });
  };

  if (concallSection.length > 0) {
    // Try rows (tr) or list items (li)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    concallSection.find("tr, li").each((_: any, el: any) => {
      const rowText = $(el).text();
      const dateMatch = rowText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+20\d\d/i);
      if (dateMatch) {
        processRow(dateMatch[0], $(el));
      }
    });
  }

  // Fallback: scan all transcript links on page and find associated dates
  if (entries.length === 0) {
    $("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text !== "transcript" && text !== "transcript pdf") return;

      const href = $(el).attr("href") ?? "";
      const $parent = $(el).parent().parent(); // go up a few levels
      const parentText = $parent.text();
      const dateMatch = parentText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+20\d\d/i);
      if (dateMatch) {
        const quarter = screenerDateToQuarter(dateMatch[0]);
        if (quarter) {
          entries.push({
            dateLabel: dateMatch[0],
            quarter,
            transcriptUrl: href.startsWith("http") ? href : href ? `${SCREENER_BASE}${href}` : null,
          });
        }
      }
    });
  }

  // Deduplicate by quarter (keep first occurrence)
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.quarter)) return false;
    seen.add(e.quarter);
    return true;
  });
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const symbols: string[] = [];
let targetQuarters: string[] = ["Q3-FY26", "Q4-FY26"];
let dryRun = false;
let allMissing = false;

for (const arg of args) {
  if (arg.startsWith("--quarters=")) {
    targetQuarters = arg.split("=")[1].split(",").map((q) => q.trim().toUpperCase());
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "--all-missing") {
    allMissing = true;
  } else if (!arg.startsWith("--")) {
    symbols.push(arg.toUpperCase());
  }
}

// Default symbol list: all stocks with Q4-FY26 only (most urgent) + CANBK (has Q3 needs Q4)
const Q4_ONLY = [
  "SBIN","BANKBARODA","UNIONBANK","PNB","SBILIFE","BAJFINANCE","MUTHOOTFIN","M&MFIN",
  "SUNPHARMA","DRREDDY","DIVISLAB","ZYDUSLIFE","M&M","BAJAJ-AUTO","EICHERMOT","HYUNDAI",
  "VBL","UNITDSPR","RELIANCE","TATAPOWER","ADANIENSOL","ADANIGREEN","JSWSTEEL","TATASTEEL",
  "BHARTIARTL","ULTRACEMCO","AMBUJACEM","PIDILITIND","LT","ADANIENT","TITAN","ETERNAL",
  "DLF","LODHA",
];
const CANBK_ONLY = ["CANBK"]; // has Q3-FY26 only, needs Q4-FY26

let targetSymbols: string[];
if (symbols.length > 0) {
  targetSymbols = symbols.filter((s) => SYMBOL_SECTOR[s] !== undefined);
} else if (allMissing) {
  targetSymbols = Object.keys(SYMBOL_SECTOR).filter((s) => SYMBOL_SECTOR[s]);
} else {
  // Default: Q4-only stocks (get Q3-FY26) + CANBK (get Q4-FY26)
  targetSymbols = [...Q4_ONLY, ...CANBK_ONLY];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cookie = process.env.SCREENER_COOKIE ?? "";
  if (!cookie) {
    console.error(`
ERROR: SCREENER_COOKIE env var is required.

How to get it:
  1. Log in to screener.in in your browser
  2. Open DevTools (F12) → Application → Cookies → screener.in
  3. Copy the values of "sessionid" and "csrftoken"
  4. Run:
     SCREENER_COOKIE="sessionid=YOUR_VALUE; csrftoken=YOUR_VALUE" npx tsx scripts/intel-seed-screener.ts
`);
    process.exit(1);
  }

  console.log(`Screener transcript seeder`);
  console.log(`  Symbols:  ${targetSymbols.length}`);
  console.log(`  Quarters: ${targetQuarters.join(", ")}`);
  if (dryRun) console.log(`  DRY RUN — will not download or write files\n`);
  console.log();

  let found = 0, downloaded = 0, ingested = 0, skipped = 0, errors = 0;

  for (const symbol of targetSymbols) {
    process.stdout.write(`[${symbol}] `);

    // Fetch and parse Screener concalls
    let concalls: ConcallEntry[];
    try {
      concalls = await fetchScreenerConcalls(symbol, cookie);
    } catch (e) {
      console.log(`  screener error: ${(e as Error).message}`);
      errors++;
      continue;
    }

    if (concalls.length === 0) {
      console.log("  no concalls found on Screener");
      continue;
    }

    // Filter to target quarters
    const wanted = concalls.filter((c) => targetQuarters.includes(c.quarter));

    if (wanted.length === 0) {
      const available = concalls.map((c) => c.quarter).join(", ");
      console.log(`  target quarter not found (available: ${available})`);
      continue;
    }

    for (const entry of wanted) {
      found++;
      if (!entry.transcriptUrl) {
        process.stdout.write(`  ${entry.quarter}(no-link)`);
        continue;
      }

      if (dryRun) {
        process.stdout.write(`  ${entry.quarter}(dry:${entry.transcriptUrl.slice(0, 60)})`);
        continue;
      }

      // Download PDF
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await fetchUrl(entry.transcriptUrl, cookie, "*/*") as Buffer;
        downloaded++;
      } catch (e) {
        process.stdout.write(`  ${entry.quarter}(dl-err:${(e as Error).message.slice(0, 30)})`);
        errors++;
        continue;
      }

      // Check it's actually a PDF
      if (!pdfBuffer.slice(0, 5).toString("ascii").startsWith("%PDF")) {
        process.stdout.write(`  ${entry.quarter}(not-pdf)`);
        errors++;
        continue;
      }

      // Ingest through the existing pipeline (PDF → text → save)
      const fakeFilename = `screener-${symbol}-${entry.quarter}.pdf`;
      try {
        const result = await ingestPdfTranscript(pdfBuffer, symbol, fakeFilename);
        if (result.alreadyExisted) {
          process.stdout.write(`  ${entry.quarter}(exists)`);
          skipped++;
        } else {
          process.stdout.write(`  ${entry.quarter}(${result.chars}c)`);
          ingested++;
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("0 chars")) {
          process.stdout.write(`  ${entry.quarter}(scanned-pdf)`);
        } else {
          process.stdout.write(`  ${entry.quarter}(ingest-err:${msg.slice(0, 30)})`);
        }
        errors++;
      }
    }

    console.log(); // newline after all quarters for this symbol
    // Small delay to be polite to Screener's servers
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Screener seeding complete.`);
  console.log(`  Symbols processed: ${targetSymbols.length}`);
  console.log(`  Target quarters found: ${found}`);
  console.log(`  Downloaded:  ${downloaded} PDFs`);
  console.log(`  Ingested:    ${ingested} new transcripts`);
  console.log(`  Skipped:     ${skipped} (already existed)`);
  console.log(`  Errors:      ${errors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
