/**
 * POST /api/intel/auto-ingest
 *
 * Checks for new earnings call transcripts and ingests them automatically.
 *
 * Sources (in priority order):
 *   1. BSE AnnSubCategoryGetData API (Result, Board Meeting, Analyst/Investor Meet)
 *   2. Screener.in company page HTML (fallback for audio-filing companies)
 *
 * After ingestion, optionally triggers Stage 3 (claim extraction) and
 * Stage 4 (cross-verification) for newly ingested symbols.
 *
 * Body (JSON):
 *   symbols?: string[]      — specific symbols to check (default: all SYMBOL_SECTOR)
 *   lookbackDays?: number   — how many days back to search BSE (default: 14)
 *   runPipeline?: boolean   — run Stage 3+4 after ingestion (default: false)
 *   screenerFallback?: boolean — try Screener for 0-result BSE symbols (default: true)
 *
 * Response:
 *   { ingested, skipped, errors, pipelineTriggered, symbols: [...] }
 */

import { NextResponse } from "next/server";
import https from "node:https";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import {
  fetchHistoricalTranscripts,
  SYMBOL_TO_SCRIP,
  BSE_ATTACH_LIVE,
  BSE_ATTACH_HIS,
} from "@/lib/intel/bse-transcript-scraper";
import { fetchScreenerConcalls, displayDateToQuarter } from "@/lib/intel/screener-scraper";
import {
  ingestPdfTranscript,
  runFullPipeline,
} from "@/lib/intel/pipeline";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MIN_USEFUL_CHARS = 5_000; // below this → junk filing (press release/agenda), not a real transcript
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── PDF download ─────────────────────────────────────────────────────────────

function downloadPdf(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => req.destroy(new Error("Download timed out")),
      60_000,
    );
    const req = https.get(
      url,
      {
        headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" },
        insecureHTTPParser: true,
      },
      (res) => {
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
            reject(new Error("PDF too large"));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          const buf = Buffer.concat(chunks);
          if (buf.length < 5 || buf.slice(0, 4).toString("ascii") !== "%PDF") {
            reject(new Error("HTTP 404")); // soft-404 (HTML response)
            return;
          }
          resolve(buf);
        });
        res.on("error", (e) => { clearTimeout(timer); reject(e); });
      },
    );
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Try AttachLive first, fall back to AttachHis for aged-out files */
async function downloadWithFallback(attachment: string): Promise<Buffer> {
  const encoded = encodeURIComponent(attachment);
  try {
    return await downloadPdf(`${BSE_ATTACH_LIVE}${encoded}`);
  } catch (e) {
    if (!(e as Error).message.includes("HTTP 404")) throw e;
    return await downloadPdf(`${BSE_ATTACH_HIS}${encoded}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      symbols?: string[];
      lookbackDays?: number;
      runPipeline?: boolean;
      screenerFallback?: boolean;
    };

    const targetSymbols = (body.symbols ?? Object.keys(SYMBOL_SECTOR))
      .map((s) => s.toUpperCase())
      .filter((s) => s in SYMBOL_SECTOR);

    const lookbackDays = Math.min(body.lookbackDays ?? 14, 90);
    const runPipeline = body.runPipeline ?? false;
    const screenerFallback = body.screenerFallback ?? true;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    const result = {
      ingested: 0,
      skipped: 0,
      errors: 0,
      pipelineTriggered: [] as string[],
      symbols: [] as Array<{
        symbol: string;
        source: "bse" | "screener";
        quarter: string;
        status: "ingested" | "skipped" | "error";
        detail?: string;
      }>,
    };

    for (const symbol of targetSymbols) {
      const scripCodes = SYMBOL_TO_SCRIP[symbol] ?? [];
      // No early-exit for missing scrip codes — fall through to Screener fallback.

      let bseFilings: Awaited<ReturnType<typeof fetchHistoricalTranscripts>> = [];
      for (const scrip of scripCodes) {
        try {
          const filings = await fetchHistoricalTranscripts(scrip, startDate);
          bseFilings.push(...filings);
        } catch {
          // BSE API error — continue
        }
      }

      // ── BSE source ─────────────────────────────────────────────────────────
      let bseUsefulIngested = 0; // count of transcripts above MIN_USEFUL_CHARS threshold
      for (const filing of bseFilings) {
        const attachment = filing.ATTACHMENTNAME?.trim();
        if (!attachment) continue;

        // Security: validate attachment filename
        if (!/^[\w\-. (){}]+\.pdf$/i.test(attachment)) continue;

        let pdfBuf: Buffer;
        try {
          pdfBuf = await downloadWithFallback(attachment);
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("HTTP 404")) continue;
          result.errors++;
          result.symbols.push({
            symbol,
            source: "bse",
            quarter: "unknown",
            status: "error",
            detail: msg,
          });
          continue;
        }

        try {
          const ingested = await ingestPdfTranscript(pdfBuf, symbol, attachment);
          if (ingested.alreadyExisted) {
            result.skipped++;
            if (ingested.chars >= MIN_USEFUL_CHARS) bseUsefulIngested++;
            result.symbols.push({
              symbol,
              source: "bse",
              quarter: ingested.quarter,
              status: "skipped",
            });
          } else {
            result.ingested++;
            if (ingested.chars >= MIN_USEFUL_CHARS) bseUsefulIngested++;
            result.symbols.push({
              symbol,
              source: "bse",
              quarter: ingested.quarter,
              status: "ingested",
            });
          }
        } catch (e) {
          result.errors++;
          result.symbols.push({
            symbol,
            source: "bse",
            quarter: "unknown",
            status: "error",
            detail: (e as Error).message.slice(0, 80),
          });
        }
      }

      // ── Screener supplement ───────────────────────────────────────────────
      // Always runs (unless screenerFallback=false) as an additive supplement to BSE.
      // BSE is not a reliable source for the latest transcript — subcategories shift,
      // attachments get purged. Screener aggregates from multiple sources and
      // consistently has the latest. alreadyExisted quarters are skipped, so this is safe.
      if (screenerFallback) {
        let screenerConcalls: Awaited<ReturnType<typeof fetchScreenerConcalls>> = [];
        try {
          screenerConcalls = await fetchScreenerConcalls(symbol);
        } catch {
          // Screener fetch failed — skip
        }

        for (const concall of screenerConcalls) {
          // Re-validate URL server-side — scraper validation runs client-side
          // but the download happens from the server's network context.
          try {
            const p = new URL(concall.pdfUrl);
            const h = p.hostname.toLowerCase();
            if (
              p.protocol !== "https:" ||
              h === "localhost" ||
              h.startsWith("127.") ||
              h.startsWith("10.") ||
              h.startsWith("192.168.") ||
              h.startsWith("169.254.") ||
              /^172\.(1[6-9]|2\d|3[01])\./.test(h)
            ) continue;
          } catch { continue; }

          let pdfBuf: Buffer;
          try {
            pdfBuf = await downloadPdf(concall.pdfUrl);
          } catch (e) {
            result.errors++;
            result.symbols.push({
              symbol, source: "screener", quarter: "unknown", status: "error",
              detail: `DL failed ${concall.displayDate}: ${(e as Error).message.slice(0, 60)}`,
            });
            continue;
          }

          const screenerQtr = displayDateToQuarter(concall.displayDate) ?? undefined;
          const fakeName = `screener-${symbol}-${concall.displayDate.replace(/\s/g, "-")}.pdf`;
          try {
            const ingested = await ingestPdfTranscript(pdfBuf, symbol, fakeName, screenerQtr);
            if (ingested.alreadyExisted) {
              result.skipped++;
              result.symbols.push({
                symbol, source: "screener", quarter: ingested.quarter, status: "skipped",
              });
            } else {
              result.ingested++;
              result.symbols.push({
                symbol, source: "screener", quarter: ingested.quarter, status: "ingested",
              });
            }
          } catch (e) {
            result.errors++;
            result.symbols.push({
              symbol, source: "screener", quarter: "unknown", status: "error",
              detail: (e as Error).message.slice(0, 80),
            });
          }
        }
      }

      // ── Trigger pipeline for newly ingested symbols ────────────────────────
      const wasNewlyIngested = result.symbols.some(
        (s) => s.symbol === symbol && s.status === "ingested",
      );

      if (wasNewlyIngested && runPipeline) {
        // Fire-and-forget — pipeline runs asynchronously
        runFullPipeline(symbol).catch(console.error);
        result.pipelineTriggered.push(symbol);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("auto-ingest error:", error);
    return NextResponse.json(
      { error: "Auto-ingest failed", detail: String(error) },
      { status: 500 },
    );
  }
}
