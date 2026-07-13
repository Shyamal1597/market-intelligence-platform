/**
 * scripts/intel-daily-earnings-check.ts
 *
 * Daily earnings-season watcher for the coverage universe (100 stocks).
 * Intended to run once a day via Windows Task Scheduler (see docs at bottom).
 *
 *   1. Detects which tracked companies filed "Financial Results" recently (NSE RSS feed).
 *   2. Tries to download the concall transcript for every tracked symbol -- BSE first,
 *      Screener.in as fallback (BSE purges/misses attachments; Screener aggregates both).
 *      Every new transcript downloaded raises an immediate desktop popup listing the
 *      symbol(s)/quarter(s), and is added to a pending-verification queue -- the signal
 *      to manually prompt Claude Code to spawn a verification agent for that quarter.
 *   3. If results were filed >= GRACE_DAYS ago and we STILL have no transcript covering
 *      that quarter, raises a separate desktop alert (Windows popup + JSON log), deduped
 *      so the same missing transcript doesn't re-alert every day.
 *
 * Usage:
 *   npx tsx scripts/intel-daily-earnings-check.ts
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import https from "node:https";
import { execFile } from "node:child_process";
import {
  fetchHistoricalTranscripts,
  SYMBOL_TO_SCRIP,
  COMPANY_NAME_PATTERNS,
} from "@/lib/intel/bse-transcript-scraper";
import { fetchScreenerConcalls, displayDateToQuarter } from "@/lib/intel/screener-scraper";
import { ingestPdfTranscript } from "@/lib/intel/pipeline";
import { reportingQuarterFromCallDate } from "@/lib/intel/transcripts";
import { fetchNSEFilings } from "@/lib/nse-filings";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BSE_ATTACH_LIVE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";
const BSE_ATTACH_HIS  = "https://www.bseindia.com/xml-data/corpfiling/AttachHis/";
const MAX_PDF_SIZE = 20 * 1024 * 1024;

const RECENT_WINDOW_DAYS = 10;   // how far back to look for new BSE/Screener transcripts each run
const RESULTS_LOOKBACK_DAYS = 45; // ignore stale NSE "results" filings older than this
const GRACE_DAYS = 3;             // days after a results filing before we consider the transcript overdue
const REALERT_DAYS = 5;           // don't re-alert the same missing symbol/quarter more often than this
const SCREENER_RECENT_CAP = 4;    // only attempt the N most recent Screener concalls per symbol per run

const DATA_DIR       = path.join(process.cwd(), "data", "intelligence");
const ALERT_STATE_PATH = path.join(DATA_DIR, "_earnings-alert-state.json");
const ALERTS_LOG_PATH   = path.join(DATA_DIR, "_earnings-alerts.json");
const RUN_LOG_PATH      = path.join(DATA_DIR, "_earnings-check-log.json");
const PENDING_QUEUE_PATH = path.join(DATA_DIR, "_pending-verification.json");

// -- PDF download (lenient HTTP parser -- BSE sends malformed headers) --------
// Screener.in's concall links are almost always redirects (301/302) to the
// actual PDF host -- must follow them, with the same SSRF guards used when
// the link was first collected in screener-scraper.ts.

function isSafeRedirectTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function downloadPdf(url: string, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Download timed out")), 60_000);
    const req = https.get(url, {
      headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" },
      insecureHTTPParser: true,
    }, (res) => {
      const status = res.statusCode ?? 0;

      if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects"));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        if (!isSafeRedirectTarget(nextUrl)) {
          reject(new Error(`Redirect to unsafe URL rejected: ${nextUrl.slice(0, 100)}`));
          return;
        }
        downloadPdf(nextUrl, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status !== 200) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${status}`));
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
        if (buf.length < 5 || buf.slice(0, 4).toString("ascii") !== "%PDF") {
          reject(new Error("HTTP 404")); // BSE returns HTML error page as 200 for purged attachments
          return;
        }
        resolve(buf);
      });
      res.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// -- Per-symbol ingestion (BSE -> Screener fallback) ---------------------------

interface IngestedTranscript {
  quarter: string;
  source: "bse" | "screener";
}

async function ingestRecentForSymbol(symbol: string, startDate: Date): Promise<{ ingested: IngestedTranscript[]; errors: string[] }> {
  const ingested: IngestedTranscript[] = [];
  const errors: string[] = [];

  const scripCodes = SYMBOL_TO_SCRIP[symbol] ?? [];
  let bseFilingsFound = 0;

  for (const scrip of scripCodes) {
    let filings;
    try {
      filings = await fetchHistoricalTranscripts(scrip, startDate);
    } catch (e) {
      errors.push(`BSE fetch error (${scrip}): ${(e as Error).message}`);
      continue;
    }
    bseFilingsFound += filings.length;

    for (const filing of filings) {
      const attachment = filing.ATTACHMENTNAME?.trim();
      if (!attachment) continue;
      const encoded = encodeURIComponent(attachment);
      const liveUrl = `${BSE_ATTACH_LIVE}${encoded}`;
      const hisUrl  = `${BSE_ATTACH_HIS}${encoded}`;
      try {
        const parsedUrl = new URL(liveUrl);
        if (parsedUrl.hostname !== "www.bseindia.com") continue;
      } catch { continue; }

      let pdfBuffer: Buffer;
      try {
        try {
          pdfBuffer = await downloadPdf(liveUrl);
        } catch (e1) {
          if (!(e1 as Error).message.includes("HTTP 404")) throw e1;
          pdfBuffer = await downloadPdf(hisUrl);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("HTTP 404")) errors.push(`Download failed for ${symbol}: ${msg}`);
        continue;
      }

      try {
        const result = await ingestPdfTranscript(pdfBuffer, symbol, attachment, undefined, "bse");
        if (!result.alreadyExisted) ingested.push({ quarter: result.quarter, source: "bse" });
      } catch (e) {
        errors.push(`Ingest failed for ${symbol}: ${(e as Error).message}`);
      }
    }
  }

  // Screener fallback -- catches quarters BSE missed/purged. Only look at the
  // most recent few concalls (Screener lists newest-first) -- this is a daily
  // incremental check, not a historical backfill, so we don't re-attempt years
  // of already-known-missing quarters every single day.
  try {
    const concalls = (await fetchScreenerConcalls(symbol)).slice(0, SCREENER_RECENT_CAP);
    for (const concall of concalls) {
      const screenerQtr = displayDateToQuarter(concall.displayDate) ?? undefined;
      // Skip if we already have this quarter (avoid redundant downloads every run)
      if (screenerQtr && existsSync(path.join(DATA_DIR, symbol, "transcripts", `${screenerQtr}.txt`))) continue;

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await downloadPdf(concall.pdfUrl);
      } catch (e) {
        errors.push(`Screener DL failed for ${symbol} (${concall.displayDate}): ${(e as Error).message}`);
        continue;
      }

      const fakeName = `screener-${symbol}-${concall.displayDate.replace(/\s/g, "-")}.pdf`;
      try {
        const result = await ingestPdfTranscript(pdfBuffer, symbol, fakeName, screenerQtr, "screener");
        if (!result.alreadyExisted) ingested.push({ quarter: result.quarter, source: "screener" });
      } catch (e) {
        errors.push(`Screener ingest failed for ${symbol}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`Screener fetch failed for ${symbol}: ${(e as Error).message}`);
  }

  void bseFilingsFound; // kept for future diagnostics
  return { ingested, errors };
}

// -- NSE "Financial Results" matching -------------------------------------------

function matchCompanyToSymbol(company: string): string | null {
  const nameLower = company.toLowerCase();
  for (const [sym, patterns] of Object.entries(COMPANY_NAME_PATTERNS)) {
    if (!SYMBOL_SECTOR[sym]) continue;
    if (patterns.some((p) => p.test(nameLower))) return sym;
  }
  return null;
}

// -- Alert state (dedup) --------------------------------------------------------

interface AlertState {
  [key: string]: { lastAlertedAt: string }; // key = "SYMBOL:QUARTER"
}

async function loadAlertState(): Promise<AlertState> {
  try {
    return JSON.parse(await fs.readFile(ALERT_STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveAlertState(state: AlertState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ALERT_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

interface AlertLogEntry {
  symbol: string;
  quarter: string;
  resultFiledAt: string;
  daysOverdue: number;
  detectedAt: string;
}

async function appendAlertsLog(entries: AlertLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  let log: AlertLogEntry[] = [];
  try {
    log = JSON.parse(await fs.readFile(ALERTS_LOG_PATH, "utf-8"));
  } catch { /* first run */ }
  log.push(...entries);
  if (log.length > 200) log = log.slice(-200);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ALERTS_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

interface RunLogEntry {
  timestamp: string;
  resultsFilingsScanned: number;
  symbolsMatched: number;
  transcriptsIngested: number;
  alertsRaised: number;
  errors: string[];
}

async function appendRunLog(entry: RunLogEntry): Promise<void> {
  let log: RunLogEntry[] = [];
  try {
    log = JSON.parse(await fs.readFile(RUN_LOG_PATH, "utf-8"));
  } catch { /* first run */ }
  log.push(entry);
  if (log.length > 60) log = log.slice(-60);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RUN_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

// -- Pending verification queue --------------------------------------------------
// Every newly-downloaded transcript lands here so the analyst can ask Claude Code
// to spawn a verification agent for exactly these symbol/quarter pairs. Entries
// persist until manually cleared (e.g. by asking Claude to process the queue).

interface PendingEntry {
  symbol: string;
  quarter: string;
  source: "bse" | "screener";
  ingestedAt: string;
}

async function loadPendingQueue(): Promise<PendingEntry[]> {
  try {
    return JSON.parse(await fs.readFile(PENDING_QUEUE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

async function savePendingQueue(entries: PendingEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PENDING_QUEUE_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

// -- Desktop notification (Windows popup, fire-and-forget) ---------------------

function notify(message: string, title = "Sunidhi Intel -- Earnings Alert", icon: "Warning" | "Information" = "Warning"): void {
  const safe = message.replace(/'/g, "''").slice(0, 1000);
  const safeTitle = title.replace(/'/g, "''");
  const script =
    `Add-Type -AssemblyName System.Windows.Forms; ` +
    `[System.Windows.Forms.MessageBox]::Show('${safe}','${safeTitle}',` +
    `[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::${icon}) | Out-Null`;

  try {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
      { windowsHide: true },
      (err) => { if (err) console.error("[notify] popup failed:", err.message); },
    );
    child.unref();
  } catch (e) {
    console.error("[notify] failed to spawn popup:", (e as Error).message);
  }
}

// -- Main ------------------------------------------------------------------------

async function main() {
  const now = new Date();
  const errors: string[] = [];

  // 1. Fetch NSE "Financial Results" filings, match to our coverage universe.
  let resultsFilings: { company: string; submittedAt: string }[] = [];
  try {
    const all = await fetchNSEFilings(1000);
    resultsFilings = all.filter((f) => f.category === "results");
  } catch (e) {
    errors.push(`NSE filings fetch failed: ${(e as Error).message}`);
  }

  const lookbackCutoff = new Date(now);
  lookbackCutoff.setDate(lookbackCutoff.getDate() - RESULTS_LOOKBACK_DAYS);

  const latestResultDate: Record<string, string> = {};
  for (const f of resultsFilings) {
    const filedAt = new Date(f.submittedAt);
    if (filedAt < lookbackCutoff) continue;
    const sym = matchCompanyToSymbol(f.company);
    if (!sym) continue;
    if (!latestResultDate[sym] || filedAt > new Date(latestResultDate[sym])) {
      latestResultDate[sym] = f.submittedAt;
    }
  }
  console.log(`[1/3] Matched ${Object.keys(latestResultDate).length} tracked symbols with recent results filings.`);

  // 2. Try to download/ingest the latest transcript for every tracked symbol.
  const recentStart = new Date(now);
  recentStart.setDate(recentStart.getDate() - RECENT_WINDOW_DAYS);

  const symbols = Object.keys(SYMBOL_SECTOR);
  let totalIngested = 0;
  const newlyIngested: PendingEntry[] = [];
  console.log(`[2/3] Checking ${symbols.length} tracked symbols for new transcripts (BSE + Screener)...`);
  for (const symbol of symbols) {
    try {
      const { ingested, errors: symErrors } = await ingestRecentForSymbol(symbol, recentStart);
      if (ingested.length > 0) {
        console.log(`  ${symbol}: ingested ${ingested.map((i) => `${i.quarter} (${i.source})`).join(", ")}`);
        totalIngested += ingested.length;
        for (const i of ingested) {
          newlyIngested.push({ symbol, quarter: i.quarter, source: i.source, ingestedAt: now.toISOString() });
        }
      }
      errors.push(...symErrors);
    } catch (e) {
      errors.push(`Unhandled error for ${symbol}: ${(e as Error).message}`);
    }
  }

  // Queue newly-ingested transcripts for manual verification + notify immediately.
  if (newlyIngested.length > 0) {
    const queue = await loadPendingQueue();
    for (const entry of newlyIngested) {
      // Dedupe by symbol+quarter -- keep the newest entry if it somehow reappears.
      const idx = queue.findIndex((q) => q.symbol === entry.symbol && q.quarter === entry.quarter);
      if (idx >= 0) queue[idx] = entry;
      else queue.push(entry);
    }
    await savePendingQueue(queue);

    const lines = newlyIngested.map((i) => `${i.symbol} (${i.quarter}) -- via ${i.source}`);
    const message =
      `${newlyIngested.length} new transcript${newlyIngested.length === 1 ? "" : "s"} downloaded -- ` +
      `ready for verification:\n\n${lines.join("\n")}\n\n` +
      `Ask Claude Code to run the claim verification workflow for ${newlyIngested.length === 1 ? "this symbol" : "these symbols"}.`;
    console.log(`[2/3] NEW TRANSCRIPTS: ${message}`);
    notify(message, "Sunidhi Intel -- New Transcript(s) Ready", "Information");
  }

  // 3. Determine which symbols are overdue: results filed >= GRACE_DAYS ago,
  //    still no transcript on disk for the expected quarter.
  const alertState = await loadAlertState();
  const newAlerts: AlertLogEntry[] = [];
  const alertMessages: string[] = [];

  for (const [symbol, resultDate] of Object.entries(latestResultDate)) {
    const filedAt = new Date(resultDate);
    const daysSince = (now.getTime() - filedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < GRACE_DAYS) continue;

    const expectedQuarter = reportingQuarterFromCallDate(resultDate);
    const transcriptPath = path.join(DATA_DIR, symbol, "transcripts", `${expectedQuarter}.txt`);
    if (existsSync(transcriptPath)) continue; // we have it -- no alert needed

    const key = `${symbol}:${expectedQuarter}`;
    const prior = alertState[key];
    if (prior) {
      const daysSinceAlert = (now.getTime() - new Date(prior.lastAlertedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAlert < REALERT_DAYS) continue; // already alerted recently, skip
    }

    alertState[key] = { lastAlertedAt: now.toISOString() };
    const daysOverdue = Math.floor(daysSince);
    newAlerts.push({
      symbol,
      quarter: expectedQuarter,
      resultFiledAt: resultDate,
      daysOverdue,
      detectedAt: now.toISOString(),
    });
    alertMessages.push(`${symbol} (${expectedQuarter}) -- results filed ${daysOverdue}d ago, no transcript found on BSE or Screener yet.`);
  }

  if (newAlerts.length > 0) {
    await saveAlertState(alertState);
    await appendAlertsLog(newAlerts);
    const message = `${newAlerts.length} compan${newAlerts.length === 1 ? "y" : "ies"} released results but no transcript found yet:\n\n${alertMessages.join("\n")}`;
    console.log(`[3/3] ALERT: ${message}`);
    notify(message);
  } else {
    console.log("[3/3] No overdue transcripts to alert on.");
  }

  await appendRunLog({
    timestamp: now.toISOString(),
    resultsFilingsScanned: resultsFilings.length,
    symbolsMatched: Object.keys(latestResultDate).length,
    transcriptsIngested: totalIngested,
    alertsRaised: newAlerts.length,
    errors,
  });

  console.log(`\nDone. Ingested ${totalIngested} new transcript(s), raised ${newAlerts.length} alert(s), ${errors.length} error(s).`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
