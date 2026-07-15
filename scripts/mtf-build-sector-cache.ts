/**
 * scripts/mtf-build-sector-cache.ts
 *
 * Builds data/mtf-sector-cache.json: real BSE sector/industry classification
 * for every symbol currently in mtf_daily. Independent of the research-
 * coverage universe (SYMBOL_SECTOR) -- sourced from the exchanges directly.
 *
 * Pipeline (every step verified against real data, 2026-07-15):
 *   1. NSE EQUITY_L.csv (bulk CSV, no auth)      -- NSE symbol -> ISIN
 *   2. BSE unified bhavcopy CSV (bulk, no auth)  -- ISIN -> BSE scrip code
 *   3. BSE ComHeadernew (per scrip code)         -- scrip code -> Sector/IndustryNew
 * Each resolved entry is sanity-checked: BSE's own returned SecurityId must
 * match the symbol we looked up, or the entry is dropped. A symbol that
 * fails to resolve at any step is left OUT of the cache (shown as
 * "Unclassified" in the UI) rather than assigned a guessed sector.
 *
 * Safe to re-run. By default, symbols already in the cache are kept as-is
 * (sector classification essentially never changes) and only NEW symbols
 * are fetched from BSE -- so re-runs after new MTF uploads are fast.
 * Pass --force to ignore the existing cache and re-resolve everything.
 *
 * Usage: npx tsx scripts/mtf-build-sector-cache.ts [--force]
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import https from "node:https";
import { getMtfDb } from "../lib/mtf/db";

const CACHE_PATH = path.join(process.cwd(), "data", "mtf-sector-cache.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BSE_CALL_DELAY_MS = 300;
const FORCE = process.argv.includes("--force");

interface SectorEntry {
  sector: string;
  industry: string;
  scripCode: string;
  updatedAt: string;
}

function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": UA, Accept: "*/*", ...headers }, insecureHTTPParser: true },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(20_000, () => req.destroy(new Error("timeout")));
  });
}

function parseCsv(text: string): string[][] {
  return text.split("\n").filter(Boolean).map((l) => l.split(",").map((c) => c.trim()));
}

/** BSE doesn't publish a bhavcopy on non-trading days -- walk back to find the latest one that exists. */
async function fetchLatestBseBhavcopy(maxDaysBack = 7): Promise<string[][]> {
  for (let i = 0; i < maxDaysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const url = `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${y}${m}${day}_F_0000.CSV`;
    const text = await fetchText(url);
    if (text.startsWith("TradDt")) return parseCsv(text);
  }
  throw new Error(`Could not fetch a valid BSE bhavcopy for any of the last ${maxDaysBack} days.`);
}

async function main() {
  console.log("Fetching NSE symbol -> ISIN master list (EQUITY_L.csv)...");
  const eqCsv = parseCsv(await fetchText("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"));
  const eqHeader = eqCsv[0];
  const isinIdx = eqHeader.indexOf("ISIN NUMBER");
  const symToIsin = new Map<string, string>();
  for (const row of eqCsv.slice(1)) {
    if (row[0] && row[isinIdx]) symToIsin.set(row[0], row[isinIdx]);
  }
  console.log(`  ${symToIsin.size} NSE symbols with ISIN.`);

  console.log("Fetching BSE bhavcopy (ISIN -> scrip code)...");
  const bhavCsv = await fetchLatestBseBhavcopy();
  const bhavHeader = bhavCsv[0];
  const isinCol = bhavHeader.indexOf("ISIN");
  const scripCol = bhavHeader.indexOf("FinInstrmId");
  const isinToScrip = new Map<string, string>();
  for (const row of bhavCsv.slice(1)) {
    if (row[isinCol] && row[scripCol]) isinToScrip.set(row[isinCol], row[scripCol]);
  }
  console.log(`  ${isinToScrip.size} BSE ISIN -> scrip-code mappings.`);

  const db = await getMtfDb();
  const symbols = (db.prepare("SELECT DISTINCT symbol FROM mtf_daily").all() as { symbol: string }[])
    .map((r) => r.symbol);
  console.log(`${symbols.length} distinct symbols in mtf_daily.`);

  const existing: Record<string, SectorEntry> = !FORCE && existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf-8"))
    : {};

  const cache: Record<string, SectorEntry> = {};
  const now = new Date().toISOString();
  let reused = 0, resolved = 0, noIsin = 0, noScrip = 0, apiMismatch = 0, apiFail = 0;

  for (const symbol of symbols) {
    if (existing[symbol]) {
      cache[symbol] = existing[symbol];
      reused++;
      continue;
    }

    const isin = symToIsin.get(symbol);
    if (!isin) { noIsin++; continue; }
    const scripCode = isinToScrip.get(isin);
    if (!scripCode) { noScrip++; continue; }

    await new Promise((r) => setTimeout(r, BSE_CALL_DELAY_MS));
    try {
      const body = await fetchText(
        `https://api.bseindia.com/BseIndiaAPI/api/ComHeadernew/w?quotetype=EQ&scripcode=${scripCode}&seriesid=`,
        { Accept: "application/json", Referer: "https://www.bseindia.com/" },
      );
      const j = JSON.parse(body);
      // BSE's own returned SecurityId must match the symbol we looked up --
      // if it doesn't, the ISIN/scrip-code join landed on a DIFFERENT
      // company, and we must not attribute a sector to the wrong symbol.
      if (String(j.SecurityId ?? "").toUpperCase() !== symbol.toUpperCase()) {
        apiMismatch++;
        continue;
      }
      if (!j.Sector) { apiFail++; continue; }
      cache[symbol] = { sector: j.Sector, industry: j.IndustryNew || j.Sector, scripCode, updatedAt: now };
      resolved++;
    } catch {
      apiFail++;
    }

    if (resolved > 0 && resolved % 100 === 0) {
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`  ...${resolved} newly resolved so far (checkpoint saved)`);
    }
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(
    `Done. total=${symbols.length} reusedFromCache=${reused} newlyResolved=${resolved} ` +
    `noIsin=${noIsin} noScripInBhav=${noScrip} apiMismatch=${apiMismatch} apiFail=${apiFail} ` +
    `cacheSize=${Object.keys(cache).length}`,
  );
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
