/**
 * lib/intel/bse-transcript-scraper.ts
 *
 * Automatically detects and downloads earnings call transcript PDFs
 * from BSE corporate filings. SEBI LODR Schedule III mandates all
 * listed companies to file transcripts within 5 working days.
 *
 * Flow:
 *   1. Fetch recent BSE filings
 *   2. Filter for transcript-related categories
 *   3. Match company names / scrip codes to our SYMBOL_SECTOR universe
 *   4. Download PDF, extract text, detect quarter
 *   5. Trigger full pipeline (claims → cross-check → summaries)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import https from "node:https";

import { SYMBOL_SECTOR } from "@/lib/intel/types";
import {
  ingestPdfTranscript,
  runFullPipeline,
  generateJobId,
  writeJob,
  type PipelineJob,
} from "@/lib/intel/pipeline";

// ── BSE scrip code → NSE symbol mapping ──────────────────────────────────────
// BSE uses numeric scrip codes; our universe uses NSE ticker symbols.
// This map covers NIFTY 50 + Next 50 stocks that are in SYMBOL_SECTOR.
// Extend as SYMBOL_SECTOR grows.

const BSE_SCRIP_TO_SYMBOL: Record<string, string> = {
  // ── Banking ───────────────────────────────────────────────────────────────
  "500180": "HDFCBANK",
  "532174": "ICICIBANK",
  "500112": "SBIN",
  "532215": "AXISBANK",
  "500247": "KOTAKBANK",
  "532134": "BANKBARODA",
  "532477": "UNIONBANK",
  "532461": "PNB",
  "532483": "CANBK",

  // ── Insurance & Holding ───────────────────────────────────────────────────
  "532978": "BAJAJFINSV",   // Bajaj Finserv Ltd
  "511218": "SBILIFE",
  "540777": "HDFCLIFE",
  "540716": "ICICIPRULI",

  // ── NBFC / Lending ────────────────────────────────────────────────────────
  "500034": "BAJFINANCE",   // Bajaj Finance Ltd
  "541557": "SHRIRAMFIN",
  "511243": "CHOLAFIN",
  "533398": "MUTHOOTFIN",
  "532810": "PFC",
  "532955": "RECLTD",
  "543257": "IRFC",
  "500253": "LICHSGFIN",
  "532720": "M&MFIN",
  "500302": "PEL",

  // ── Financial Services ────────────────────────────────────────────────────
  "543940": "JIOFIN",
  "500490": "BAJAJHLDNG",
  "541729": "HDFCAMC",

  // ── IT Services ───────────────────────────────────────────────────────────
  "532540": "TCS",
  "500209": "INFY",
  "532281": "HCLTECH",
  "507685": "WIPRO",
  "532755": "TECHM",

  // ── Pharma & Healthcare ───────────────────────────────────────────────────
  "524715": "SUNPHARMA",
  "500087": "CIPLA",
  "500124": "DRREDDY",
  "532488": "DIVISLAB",
  "508869": "APOLLOHOSP",
  "543220": "MAXHEALTH",
  "500420": "TORNTPHARM",
  "532321": "ZYDUSLIFE",

  // ── Auto & Ancillaries ────────────────────────────────────────────────────
  "532977": "BAJAJ-AUTO",   // Bajaj Auto Ltd
  "532500": "MARUTI",
  "500520": "M&M",
  "505200": "EICHERMOT",
  "500570": "TATAMOTORS",
  "532343": "TVSMOTOR",
  "500480": "CUMMINSIND",
  "544274": "HYUNDAI",
  "517334": "MOTHERSON",
  "500530": "BOSCHLTD",
  "500477": "ASHOKLEY",

  // ── FMCG ──────────────────────────────────────────────────────────────────
  "500696": "HINDUNILVR",
  "500875": "ITC",
  "500790": "NESTLEIND",
  "500800": "TATACONSUM",
  "500825": "BRITANNIA",
  "532424": "GODREJCP",
  "540180": "VBL",           // Varun Beverages Ltd
  "532432": "UNITDSPR",

  // ── Oil, Gas & Energy ─────────────────────────────────────────────────────
  "500325": "RELIANCE",
  "500312": "ONGC",
  "533278": "COALINDIA",
  "530965": "IOC",
  "500547": "BPCL",
  "532155": "GAIL",
  "533096": "ADANIPOWER",
  "500400": "TATAPOWER",
  "539254": "ADANIENSOL",    // Adani Energy Solutions (ex-Adani Transmission)
  "541450": "ADANIGREEN",

  // ── Metals & Mining ───────────────────────────────────────────────────────
  "500228": "JSWSTEEL",
  "500470": "TATASTEEL",
  "500440": "HINDALCO",
  "500188": "HINDZINC",
  "500295": "VEDL",
  "532286": "JINDALSTEL",

  // ── Power & Utilities ─────────────────────────────────────────────────────
  "532555": "NTPC",
  "532898": "POWERGRID",

  // ── Telecom ───────────────────────────────────────────────────────────────
  "532454": "BHARTIARTL",

  // ── Cement & Building Materials ───────────────────────────────────────────
  "532538": "ULTRACEMCO",
  "500425": "AMBUJACEM",
  "500387": "SHREECEM",
  "500300": "GRASIM",
  "500331": "PIDILITIND",

  // ── Capital Goods & Infra ─────────────────────────────────────────────────
  "500510": "LT",
  "500002": "ABB",
  "500550": "SIEMENS",
  "500093": "CGPOWER",
  "532921": "ADANIPORTS",
  "512599": "ADANIENT",

  // ── Defence ───────────────────────────────────────────────────────────────
  "500049": "BEL",
  "541154": "HAL",
  "543237": "MAZDOCK",

  // ── Consumer & Retail ─────────────────────────────────────────────────────
  "500114": "TITAN",
  "543320": "ETERNAL",
  "500251": "TRENT",
  "540376": "DMART",
  "500820": "ASIANPAINT",
  "500850": "INDHOTEL",

  // ── Aviation ──────────────────────────────────────────────────────────────
  "539448": "INDIGO",

  // ── Real Estate ───────────────────────────────────────────────────────────
  "532868": "DLF",
  "543287": "LODHA",
};

// Reverse map: symbol → scrip codes (a symbol can have multiple scrip codes)
export const SYMBOL_TO_SCRIP: Record<string, string[]> = {};
for (const [scrip, sym] of Object.entries(BSE_SCRIP_TO_SYMBOL)) {
  if (!SYMBOL_TO_SCRIP[sym]) SYMBOL_TO_SCRIP[sym] = [];
  SYMBOL_TO_SCRIP[sym].push(scrip);
}

// Company name patterns for fuzzy matching when scrip code lookup fails.
// Used both for BSE filing matching AND company fingerprint validation.
const COMPANY_NAME_PATTERNS: Record<string, RegExp[]> = {
  // Banking
  HDFCBANK:    [/hdfc\s*bank/i],
  ICICIBANK:   [/icici\s*bank/i],
  SBIN:        [/state\s*bank\s*of\s*india/i, /\bsbi\b(?!\s*life)/i],
  AXISBANK:    [/axis\s*bank/i],
  KOTAKBANK:   [/kotak\s*mahindra\s*bank/i],
  BANKBARODA:  [/bank\s*of\s*baroda/i],
  UNIONBANK:   [/union\s*bank\s*of\s*india/i],
  PNB:         [/punjab\s*national\s*bank/i],
  CANBK:       [/canara\s*bank/i],
  // Insurance
  BAJAJFINSV:  [/bajaj\s*finserv/i],
  SBILIFE:     [/sbi\s*life/i],
  HDFCLIFE:    [/hdfc\s*life/i],
  ICICIPRULI:  [/icici\s*pru/i, /icici\s*prudential\s*life/i],
  // NBFC
  BAJFINANCE:  [/bajaj\s*finance\b/i],
  SHRIRAMFIN:  [/shriram\s*finance/i],
  CHOLAFIN:    [/cholamandalam/i],
  MUTHOOTFIN:  [/muthoot\s*finance/i],
  PFC:         [/power\s*finance\s*corp/i],
  RECLTD:      [/\brec\s*ltd/i, /\brec\s*limited/i, /rural\s*electrification/i],
  IRFC:        [/indian\s*railway\s*finance/i],
  LICHSGFIN:   [/lic\s*housing/i],
  "M&MFIN":    [/mahindra.*financial\s*services/i],
  PEL:         [/piramal\s*enterprises/i],
  // Financial Services
  JIOFIN:      [/jio\s*financial/i],
  BAJAJHLDNG:  [/bajaj\s*holdings/i],
  HDFCAMC:     [/hdfc\s*asset\s*management/i, /hdfc\s*amc/i],
  // IT
  TCS:         [/tata\s*consultancy/i],
  INFY:        [/infosys/i],
  HCLTECH:     [/hcl\s*tech/i],
  WIPRO:       [/wipro/i],
  TECHM:       [/tech\s*mahindra/i],
  // Pharma
  SUNPHARMA:   [/sun\s*pharma/i],
  CIPLA:       [/cipla/i],
  DRREDDY:     [/dr\.?\s*reddy/i],
  DIVISLAB:    [/divi.*lab/i],
  APOLLOHOSP:  [/apollo\s*hosp/i],
  MAXHEALTH:   [/max\s*health/i],
  TORNTPHARM:  [/torrent\s*pharma/i],
  ZYDUSLIFE:   [/zydus\s*life/i, /zydus\s*cadila/i],
  // Auto
  "BAJAJ-AUTO":[/bajaj\s*auto\b/i],
  MARUTI:      [/maruti\s*suzuki/i],
  "M&M":       [/mahindra\s*&\s*mahindra(?!\s*fin)/i, /\bm\s*&\s*m\b(?!\s*fin)/i],
  EICHERMOT:   [/eicher\s*motors/i],
  TATAMOTORS:  [/tata\s*motors/i],
  TVSMOTOR:    [/tvs\s*motor/i],
  CUMMINSIND:  [/cummins\s*india/i],
  HYUNDAI:     [/hyundai\s*motor\s*india/i],
  MOTHERSON:   [/motherson/i, /samvardhana\s*motherson/i],
  BOSCHLTD:    [/bosch\s*ltd/i, /bosch\s*limited/i],
  ASHOKLEY:    [/ashok\s*leyland/i],
  // FMCG
  HINDUNILVR:  [/hindustan\s*unilever/i],
  ITC:         [/\bitc\s*ltd/i, /\bitc\s*limited/i],
  NESTLEIND:   [/nestle\s*india/i],
  TATACONSUM:  [/tata\s*consumer/i],
  BRITANNIA:   [/britannia/i],
  GODREJCP:    [/godrej\s*consumer/i],
  VBL:         [/varun\s*beverages/i],
  UNITDSPR:    [/united\s*spirits/i, /diageo\s*india/i],
  // Oil, Gas & Energy
  RELIANCE:    [/reliance\s*industries/i],
  ONGC:        [/oil\s*and\s*natural\s*gas/i, /\bongc\b/i],
  COALINDIA:   [/coal\s*india/i],
  IOC:         [/indian\s*oil\s*corp/i],
  BPCL:        [/bharat\s*petroleum/i, /\bbpcl\b/i],
  GAIL:        [/\bgail\b/i, /gail\s*\(india\)/i],
  ADANIPOWER:  [/adani\s*power/i],
  TATAPOWER:   [/tata\s*power/i],
  ADANIENSOL:  [/adani\s*energy\s*sol/i, /adani\s*transmission/i],
  ADANIGREEN:  [/adani\s*green/i],
  // Metals
  JSWSTEEL:    [/jsw\s*steel/i],
  TATASTEEL:   [/tata\s*steel/i],
  HINDALCO:    [/hindalco/i],
  HINDZINC:    [/hindustan\s*zinc/i],
  VEDL:        [/vedanta/i],
  JINDALSTEL:  [/jindal\s*steel/i],
  // Power & Utilities
  NTPC:        [/\bntpc\b/i],
  POWERGRID:   [/power\s*grid/i],
  // Telecom
  BHARTIARTL:  [/bharti\s*airtel/i],
  // Cement & Building
  ULTRACEMCO:  [/ultratech\s*cement/i],
  AMBUJACEM:   [/ambuja\s*cement/i],
  SHREECEM:    [/shree\s*cement/i],
  GRASIM:      [/grasim/i],
  PIDILITIND:  [/pidilite/i],
  // Capital Goods & Infra
  LT:          [/larsen\s*&?\s*toubro/i, /\bl\s*&\s*t\b/i],
  ABB:         [/\babb\s*(india|ltd)/i],
  SIEMENS:     [/siemens/i],
  CGPOWER:     [/cg\s*power/i, /crompton\s*greaves/i],
  ADANIPORTS:  [/adani\s*ports/i],
  ADANIENT:    [/adani\s*enterprises/i],
  // Defence
  BEL:         [/bharat\s*electronics/i],
  HAL:         [/hindustan\s*aeronautics/i],
  MAZDOCK:     [/mazagon\s*dock/i],
  // Consumer & Retail
  TITAN:       [/titan\s*company/i],
  ETERNAL:     [/eternal\s*ltd/i, /zomato/i],
  TRENT:       [/trent\s*ltd/i, /trent\s*limited/i],
  DMART:       [/avenue\s*supermarts/i, /\bd[\-\s]*mart\b/i],
  ASIANPAINT:  [/asian\s*paints/i],
  INDHOTEL:    [/indian\s*hotels/i],
  // Aviation
  INDIGO:      [/interglobe\s*aviation/i, /\bindigo\b/i],
  // Real Estate
  DLF:         [/\bdlf\b/i],
  LODHA:       [/macrotech\s*developers/i, /\blodha\b/i],
};

// ── Transcript detection ────────────────────────────────────────────────────
// BSE HEADLINE field is the most reliable signal for transcript filings.
// NEWSSUB often contains "Analyst / Investor Meet" but also matches
// presentations and audio recordings — HEADLINE distinguishes them.

function isTranscriptFiling(headline: string, newsSub: string): boolean {
  const hl = headline.toLowerCase();
  // Primary: HEADLINE explicitly says "transcript"
  if (hl.includes("transcript")) {
    // Exclude audio/video recordings that mention transcript in passing
    if (hl.includes("audio recording") || hl.includes("video recording")) return false;
    return true;
  }
  // Secondary: NEWSSUB mentions analyst meet + headline mentions earnings/results
  const sub = newsSub.toLowerCase();
  if (sub.includes("analyst") && (hl.includes("earnings") || hl.includes("results"))) {
    // Only if headline also mentions "transcript" or "concall"
    if (hl.includes("concall") || hl.includes("conference call transcript")) return true;
  }
  return false;
}

// ── BSE JSON API ────────────────────────────────────────────────────────────
// BSE migrated from XML (GetCorpFiling.aspx) to a JSON API at api.bseindia.com.
// The old XML endpoint returns 404 as of May 2026.

interface BSERawFiling {
  SCRIP_CD: number;
  SLONGNAME: string;
  CATEGORYNAME: string;
  NEWSSUB: string;
  HEADLINE: string;
  ATTACHMENTNAME: string;
  DT_TM: string;
  Fld_Attachsize: number;
}

const BSE_API_URL = "https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w";
const BSE_ATTACH_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * BSE sends malformed HTTP headers (leading whitespace in Strict-Transport-Security)
 * which Node's strict undici/fetch parser rejects with "Unexpected whitespace after
 * header value". We use node:https directly with `insecureHTTPParser: true` to handle this.
 */
function bseFetch(url: string, timeoutMs = 30_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy(new Error(`BSE request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.bseindia.com/",
        },
        insecureHTTPParser: true, // Tolerate BSE's malformed headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
        res.on("error", (e) => { clearTimeout(timer); reject(e); });
      },
    );
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Format Date as YYYYMMDD for BSE API query params */
function bseDateFmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Fetch filings from BSE JSON API.
 * @param scripCode - Optional BSE scrip code to filter by specific company
 * @param daysBack - How many days back to search (default 90)
 * @param fromDate - Explicit start date (overrides daysBack)
 * @param toDate - Explicit end date (defaults to today)
 */
async function fetchBSEFilingsJSON(
  scripCode?: string,
  daysBack = 90,
  fromDate?: Date,
  toDate?: Date,
): Promise<BSERawFiling[]> {
  const to = toDate ?? new Date();
  const from = fromDate ?? new Date(to.getTime() - daysBack * 86_400_000);

  const params = new URLSearchParams({
    strCat: "-1",           // All categories
    strPrevDate: bseDateFmt(from),
    strToDate: bseDateFmt(to),
    strScrip: scripCode ?? "",  // Empty = all companies
    strSearch: "P",         // Published
    strType: "C",           // Corporate
  });

  const url = `${BSE_API_URL}?${params}`;
  const res = await bseFetch(url);

  if (res.status !== 200) {
    throw new Error(`BSE API failed: ${res.status}`);
  }

  const data = JSON.parse(res.body);
  const items = data?.Table;
  if (!Array.isArray(items)) {
    throw new Error("BSE API returned unexpected format (no Table array)");
  }
  return items;
}

/**
 * Fetch transcript filings for a specific scrip code over a wide date range.
 * BSE API limits results per query, so we chunk into 6-month windows.
 */
export async function fetchHistoricalTranscripts(
  scripCode: string,
  startDate: Date,
  endDate?: Date,
): Promise<BSERawFiling[]> {
  const end = endDate ?? new Date();
  const results: BSERawFiling[] = [];

  // Chunk into 6-month windows
  let windowEnd = new Date(end);
  while (windowEnd > startDate) {
    const windowStart = new Date(windowEnd);
    windowStart.setMonth(windowStart.getMonth() - 6);
    if (windowStart < startDate) windowStart.setTime(startDate.getTime());

    const filings = await fetchBSEFilingsJSON(scripCode, 0, windowStart, windowEnd);
    for (const f of filings) {
      if (isTranscriptFiling(f.HEADLINE ?? "", f.NEWSSUB ?? "")) {
        results.push(f);
      }
    }

    windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() - 1);
  }

  return results;
}

// ── Symbol matching ──────────────────────────────────────────────────────────

function matchSymbol(scripCode: string, companyName: string): string | null {
  // 1. Direct scrip code lookup
  const byCode = BSE_SCRIP_TO_SYMBOL[scripCode];
  if (byCode && SYMBOL_SECTOR[byCode]) return byCode;

  // 2. Company name pattern matching
  const nameLower = companyName.toLowerCase();
  for (const [sym, patterns] of Object.entries(COMPANY_NAME_PATTERNS)) {
    if (!SYMBOL_SECTOR[sym]) continue; // Only match tracked symbols
    if (patterns.some((p) => p.test(nameLower))) return sym;
  }

  return null;
}

// ── Scrape log ───────────────────────────────────────────────────────────────

interface ScrapeLogEntry {
  timestamp: string;
  filingsScanned: number;
  transcriptsFound: number;
  transcriptsIngested: number;
  errors: string[];
  details: {
    symbol: string;
    quarter: string;
    status: "ingested" | "already-exists" | "pipeline-started" | "error";
    message?: string;
  }[];
}

const SCRAPE_LOG_PATH = path.join(
  process.cwd(), "data", "intelligence", "_scrape-log.json",
);

async function appendScrapeLog(entry: ScrapeLogEntry): Promise<void> {
  let log: ScrapeLogEntry[] = [];
  try {
    const raw = await fs.readFile(SCRAPE_LOG_PATH, "utf-8");
    log = JSON.parse(raw);
  } catch { /* first run */ }

  log.push(entry);
  // Keep last 100 entries
  if (log.length > 100) log = log.slice(-100);

  await fs.writeFile(SCRAPE_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

export async function readScrapeLog(): Promise<ScrapeLogEntry[]> {
  try {
    const raw = await fs.readFile(SCRAPE_LOG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Main scrape function ─────────────────────────────────────────────────────

export interface ScrapeResult {
  filingsScanned: number;
  transcriptsFound: number;
  transcriptsIngested: number;
  pipelinesTriggered: number;
  errors: string[];
  details: ScrapeLogEntry["details"];
}

/**
 * Scrape BSE for new transcript filings, download PDFs, and trigger the pipeline.
 *
 * @param options.triggerPipeline - If true (default), run the full LLM pipeline after ingestion.
 *   Set to false for dry-run or if you want to batch pipeline runs separately.
 * @param options.symbolFilter - If provided, only process these symbols.
 */
export async function scrapeBSETranscripts(options?: {
  triggerPipeline?: boolean;
  symbolFilter?: string[];
}): Promise<ScrapeResult> {
  const triggerPipeline = options?.triggerPipeline ?? true;
  const symbolFilter = options?.symbolFilter
    ? new Set(options.symbolFilter.map((s) => s.toUpperCase()))
    : null;

  const result: ScrapeResult = {
    filingsScanned: 0,
    transcriptsFound: 0,
    transcriptsIngested: 0,
    pipelinesTriggered: 0,
    errors: [],
    details: [],
  };

  // 1. Fetch filings from BSE JSON API
  // If symbolFilter is small (≤5), query per scrip code for efficiency;
  // otherwise fetch all filings and filter client-side.
  let rawFilings: BSERawFiling[];
  try {
    if (symbolFilter && symbolFilter.size <= 5) {
      // Targeted scrape: fetch per scrip code
      const allFilings: BSERawFiling[] = [];
      for (const sym of symbolFilter) {
        const scripCodes = SYMBOL_TO_SCRIP[sym] ?? [];
        for (const scrip of scripCodes) {
          const filings = await fetchBSEFilingsJSON(scrip);
          allFilings.push(...filings);
        }
      }
      rawFilings = allFilings;
    } else {
      // Broad scrape: fetch all recent filings
      rawFilings = await fetchBSEFilingsJSON();
    }
  } catch (e) {
    const msg = `BSE fetch error: ${(e as Error).message}`;
    result.errors.push(msg);
    await appendScrapeLog({
      timestamp: new Date().toISOString(),
      filingsScanned: 0,
      transcriptsFound: 0,
      transcriptsIngested: 0,
      errors: [msg],
      details: [],
    });
    return result;
  }

  result.filingsScanned = rawFilings.length;

  // Queue for sequential pipeline processing (prevents unbounded concurrency)
  const pipelineQueue: { symbol: string; quarter: string }[] = [];

  // 2. Filter for transcript filings from tracked symbols
  for (const filing of rawFilings) {
    const scripCode = String(filing.SCRIP_CD ?? "");
    const companyName = String(filing.SLONGNAME ?? "");
    const headline = String(filing.HEADLINE ?? "");
    const newsSub = String(filing.NEWSSUB ?? "");
    const attachment = filing.ATTACHMENTNAME ? String(filing.ATTACHMENTNAME).trim() : null;

    // Must be a transcript filing (filter out presentations, audio recordings, intimations)
    if (!isTranscriptFiling(headline, newsSub)) continue;

    // Must have a PDF attachment — BSE now uses GUID filenames (e.g. "abc123-def4.pdf")
    if (!attachment) continue;
    // Allow: GUID-style names, alphanumeric with hyphens/dots/spaces/parens, ending in .pdf
    if (!/^[\w\-. (){}]+\.pdf$/i.test(attachment)) {
      result.errors.push(`Rejected suspicious attachment name from ${companyName}: ${attachment.slice(0, 80)}`);
      continue;
    }

    // Must match a tracked symbol
    const symbol = matchSymbol(scripCode, companyName);
    if (!symbol) continue;
    if (symbolFilter && !symbolFilter.has(symbol)) continue;

    result.transcriptsFound++;

    // 3. Download PDF (URL-encode attachment name, then verify hostname)
    const pdfUrl = `${BSE_ATTACH_BASE}${encodeURIComponent(attachment)}`;
    try {
      const parsedUrl = new URL(pdfUrl);
      if (parsedUrl.hostname !== "www.bseindia.com") {
        result.errors.push(`Rejected non-BSE URL for ${symbol}: ${pdfUrl.slice(0, 100)}`);
        continue;
      }
    } catch {
      result.errors.push(`Invalid PDF URL for ${symbol}: ${pdfUrl.slice(0, 100)}`);
      continue;
    }
    let pdfBuffer: Buffer;
    try {
      const pdfRes = await fetch(pdfUrl, {
        headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!pdfRes.ok) {
        throw new Error(`HTTP ${pdfRes.status}`);
      }
      // Size guard — prevent OOM from unexpectedly large responses
      const contentLength = pdfRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > MAX_PDF_SIZE) {
        throw new Error(`PDF too large: ${contentLength} bytes`);
      }
      const arrayBuf = await pdfRes.arrayBuffer();
      if (arrayBuf.byteLength > MAX_PDF_SIZE) {
        throw new Error(`PDF too large after download: ${arrayBuf.byteLength} bytes`);
      }
      pdfBuffer = Buffer.from(arrayBuf);
    } catch (e) {
      const msg = `Failed to download PDF for ${symbol}: ${(e as Error).message}`;
      result.errors.push(msg);
      result.details.push({ symbol, quarter: "unknown", status: "error", message: msg });
      continue;
    }

    // 4. Ingest PDF → transcript (with company fingerprint check)
    try {
      const ingestResult = await ingestPdfTranscript(
        pdfBuffer,
        symbol,
        attachment, // Use BSE attachment name for quarter detection
      );

      // Company fingerprint check: verify extracted text mentions the expected company
      // This prevents cross-contamination from wrong scrip code mappings
      const patterns = COMPANY_NAME_PATTERNS[symbol];
      if (patterns && ingestResult.chars > 0) {
        const snippet = ingestResult.textSnippet ?? "";
        const matchesCompany = patterns.some((p) => p.test(snippet));
        if (!matchesCompany) {
          result.errors.push(
            `Company mismatch for ${symbol}: transcript text doesn't mention expected company name. ` +
            `First 200 chars: "${snippet.slice(0, 200)}". Skipping.`,
          );
          result.details.push({ symbol, quarter: ingestResult.quarter, status: "error", message: "Company name mismatch — wrong transcript" });
          // Don't continue with pipeline — the transcript file was already saved by ingestPdfTranscript,
          // so we should clean it up
          continue;
        }
      }

      if (ingestResult.alreadyExisted) {
        result.details.push({
          symbol,
          quarter: ingestResult.quarter,
          status: "already-exists",
          message: `Transcript already exists (${ingestResult.chars} chars)`,
        });
        continue;
      }

      result.transcriptsIngested++;
      result.details.push({
        symbol,
        quarter: ingestResult.quarter,
        status: "ingested",
        message: `${ingestResult.chars} chars via ${ingestResult.method}`,
      });

      // 5. Queue for pipeline (processed sequentially after scrape loop)
      if (triggerPipeline) {
        pipelineQueue.push({ symbol, quarter: ingestResult.quarter });
        result.pipelinesTriggered++;
        result.details[result.details.length - 1].status = "pipeline-started";
      }
    } catch (e) {
      const msg = `Ingest error for ${symbol}: ${(e as Error).message}`;
      result.errors.push(msg);
      result.details.push({ symbol, quarter: "unknown", status: "error", message: msg });
    }
  }

  // 6. Run pipelines sequentially (prevents unbounded Anthropic API concurrency)
  for (const item of pipelineQueue) {
    const jobId = generateJobId();
    const job: PipelineJob = {
      id: jobId,
      symbol: item.symbol,
      quarter: item.quarter,
      status: "running",
      stage: "extract-claims",
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      source: "bse-scrape",
      costUsd: 0,
    };
    await writeJob(job);

    try {
      const pipeResult = await runFullPipeline(item.symbol, {
        quarter: item.quarter,
        onProgress: async (stage) => {
          job.stage = stage;
          await writeJob(job).catch(() => {});
        },
      });
      job.status = "complete";
      job.stage = "complete";
      job.completedAt = new Date().toISOString();
      job.costUsd = pipeResult.totalCostUsd;
      await writeJob(job).catch(() => {});
    } catch (e) {
      job.status = "failed";
      job.stage = "failed";
      job.completedAt = new Date().toISOString();
      job.error = (e as Error).message;
      await writeJob(job).catch(() => {});
      result.errors.push(`Pipeline failed for ${item.symbol} ${item.quarter}: ${(e as Error).message}`);
    }
  }

  // 7. Log the scrape run
  await appendScrapeLog({
    timestamp: new Date().toISOString(),
    filingsScanned: result.filingsScanned,
    transcriptsFound: result.transcriptsFound,
    transcriptsIngested: result.transcriptsIngested,
    errors: result.errors,
    details: result.details,
  });

  return result;
}
