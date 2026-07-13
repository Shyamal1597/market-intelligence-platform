/**
 * Persistent audit trail for every transcript PDF ingested into the Intel
 * pipeline, regardless of source (BSE scraper, Screener fallback, manual
 * upload, seed scripts). Two-stage: a "downloaded" event when the PDF lands
 * on disk and is extracted, and a separate "processed" event once someone
 * (manual verification workflow or the LLM pipeline) has actually written
 * verdicts to checks.json for that quarter.
 */
import path from "node:path";
import { promises as fs } from "node:fs";

const LOG_PATH = path.join(process.cwd(), "data", "intelligence", "_download-log.json");

export type DownloadSource = "bse" | "screener" | "manual-upload" | "auto-ingest";

export interface DownloadLogEntry {
  symbol: string;
  quarter: string;
  source: DownloadSource;
  /** Raw PDF location, relative to repo root. */
  pdfPath: string;
  /** Extracted transcript text location, relative to repo root. */
  transcriptPath: string;
  downloadedAt: string;
  processed: boolean;
  processedAt: string | null;
}

async function readLog(): Promise<DownloadLogEntry[]> {
  try {
    return JSON.parse(await fs.readFile(LOG_PATH, "utf-8"));
  } catch {
    return [];
  }
}

async function writeLog(entries: DownloadLogEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function appendDownloadEntry(
  entry: Omit<DownloadLogEntry, "processed" | "processedAt">,
): Promise<void> {
  const log = await readLog();
  log.push({ ...entry, processed: false, processedAt: null });
  // Keep the log bounded -- oldest entries drop off after 2000, matching the
  // bounded-log convention used elsewhere in this pipeline (_scrape-log.json etc).
  await writeLog(log.length > 2000 ? log.slice(-2000) : log);
}

/**
 * Marks every unprocessed download-log entry for (symbol, quarter) as
 * processed. Call this after writing verdicts to checks.json for that
 * quarter -- e.g. at the end of a manual claim-verification workflow, or
 * after runFullPipeline's Stage 4 completes.
 *
 * Returns how many entries were updated (0 if none matched, which usually
 * means the transcript was never logged -- e.g. pre-existing on disk before
 * this log existed -- not necessarily an error).
 */
export async function markDownloadProcessed(symbol: string, quarter: string): Promise<number> {
  const log = await readLog();
  const now = new Date().toISOString();
  let count = 0;
  for (const entry of log) {
    if (entry.symbol === symbol && entry.quarter === quarter && !entry.processed) {
      entry.processed = true;
      entry.processedAt = now;
      count++;
    }
  }
  if (count > 0) await writeLog(log);
  return count;
}

export async function readDownloadLog(): Promise<DownloadLogEntry[]> {
  return readLog();
}
