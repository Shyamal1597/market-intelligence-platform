/**
 * lib/intel/screener-scraper.ts
 *
 * Scrapes Screener.in company pages to extract concall transcript PDF URLs.
 * Used as a fallback when BSE returns no transcript filings for a symbol.
 *
 * Screener aggregates transcripts from multiple sources:
 *   - BSE AttachHis (permanent archive)
 *   - Company-hosted PDFs (IR websites)
 *
 * HTML selector: <a class="concall-link" title="Raw Transcript" href="...">
 */

import https from "node:https";
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface ScreenerConcall {
  /** Display label from Screener, e.g. "Apr 2026" */
  displayDate: string;
  /** Direct PDF URL (BSE AttachHis or company-hosted) */
  pdfUrl: string;
}

/** Fetch raw HTML from a URL using node:https */
function fetchHtml(url: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.screener.in/",
        },
      },
      (res) => {
        // Follow single redirect
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location
        ) {
          clearTimeout(timer);
          resolve(fetchHtml(res.headers.location, timeoutMs));
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        res.on("error", (e) => { clearTimeout(timer); reject(e); });
      },
    );
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Fetch all concall transcript PDF links for a symbol from Screener.
 * Returns an empty array on any fetch/parse error (best-effort fallback).
 */
export async function fetchScreenerConcalls(
  symbol: string,
): Promise<ScreenerConcall[]> {
  const url = `https://www.screener.in/company/${symbol}/consolidated/`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const concalls: ScreenerConcall[] = [];

  // Each concall quarter is a <li> inside the concalls section.
  // The quarter label is in the first <div> with class "nowrap".
  // The transcript link is <a class="concall-link" title="Raw Transcript">.
  $("a.concall-link[title='Raw Transcript']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    // Security: only allow HTTPS URLs from known-safe or well-known domains.
    // Do NOT filter by .pdf extension — Screener sometimes serves transcripts via
    // non-PDF URLs (e.g. /company/TRENT/transcript/123/). We verify content is
    // actually PDF by checking magic bytes after download.
    try {
      const parsed = new URL(href);
      // Must be HTTPS
      if (parsed.protocol !== "https:") return;
      // Block localhost and all RFC-1918 / link-local ranges
      const host = parsed.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host.startsWith("127.") ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        host.startsWith("169.254.") ||            // link-local / AWS metadata
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)  // 172.16–172.31
      ) return;
    } catch {
      return;
    }

    const li = $(el).closest("li");
    const displayDate = li.find("div.nowrap").first().text().trim();

    concalls.push({ displayDate, pdfUrl: href });
  });

  return concalls;
}

/**
 * Map a Screener display date ("Apr 2026") to our quarter format ("Q4-FY26").
 * Uses the earnings call date → result quarter convention:
 *   Apr / May  → Q4 of the FY ending that March
 *   Jul / Aug  → Q1 of the new FY
 *   Oct / Nov  → Q2
 *   Jan / Feb  → Q3
 */
export function displayDateToQuarter(displayDate: string): string | null {
  const m = displayDate.match(/^(\w{3})\s+(\d{4})$/);
  if (!m) return null;

  const [, mon, yearStr] = m;
  const year = parseInt(yearStr, 10);

  const monthMap: Record<string, { q: number; fyOffset: number }> = {
    Jan: { q: 3, fyOffset: 0 },  // Q3 FY ending March of same year
    Feb: { q: 3, fyOffset: 0 },
    Mar: { q: 4, fyOffset: 0 },  // Q4 edge case (early filers)
    Apr: { q: 4, fyOffset: 0 },  // Q4 results of FY ending March
    May: { q: 4, fyOffset: 0 },
    Jun: { q: 1, fyOffset: 1 },  // Q1 results of new FY
    Jul: { q: 1, fyOffset: 1 },
    Aug: { q: 1, fyOffset: 1 },
    Sep: { q: 2, fyOffset: 1 },  // edge case
    Oct: { q: 2, fyOffset: 1 },  // Q2 results
    Nov: { q: 2, fyOffset: 1 },
    Dec: { q: 3, fyOffset: 1 },  // edge case
  };

  const info = monthMap[mon];
  if (!info) return null;

  // FY label: April 2026 → FY ending March 2026 → FY26
  const fyYear = (info.q === 4 ? year : year + info.fyOffset - 1) % 100;
  return `Q${info.q}-FY${String(fyYear).padStart(2, "0")}`;
}
