/**
 * scripts/collect-flows.ts
 *
 * Standalone daily FII/DII data collector.
 * Run via Windows Task Scheduler every evening ~7:30 PM after NSE publishes EOD data.
 *
 * Schedule (Task Scheduler):
 *   Program:   npx
 *   Arguments: tsx scripts/collect-flows.ts
 *   Start in:  D:\Sunidhi-Intranet-Futuristic
 *   Trigger:   Daily at 19:30
 *
 * What it does:
 *   1. Establishes NSE session
 *   2. Fetches today's FII/DII snapshot
 *   3. Appends/overwrites today's entry in data/fii-dii-history.json
 *   4. Attempts gap-fill backfill for any missing recent dates
 *   5. Exits 0 on success, 1 on failure
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const HISTORY_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NSE_BASE: Record<string, string> = {
  "User-Agent":      USER_AGENT,
  Accept:            "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
};

const MONTH_MAP: Record<string, string> = {
  Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
  Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12",
};

function parseNseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2]];
    if (mo) return `${m[3]}-${mo}-${m[1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  return "";
}

function toNseParam(iso: string): string {
  const [y, m, d] = iso.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d}-${names[parseInt(m) - 1]}-${y}`;
}

function num(v: unknown): number {
  return parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;
}

async function getNseCookies(): Promise<string> {
  const htmlH = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
  function extract(res: Response): string {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const arr = h.getSetCookie
      ? h.getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
    return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  }
  const r1 = await fetch("https://www.nseindia.com", { headers: htmlH });
  const cookie = extract(r1);
  await fetch("https://www.nseindia.com/market-data/fii-dii-data", {
    headers: { ...htmlH, Cookie: cookie, Referer: "https://www.nseindia.com/" },
  });
  return cookie;
}

async function fetchSnapshot(cookie: string) {
  const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
    headers: { ...NSE_BASE, Referer: "https://www.nseindia.com/market-data/fii-dii-data", Cookie: cookie },
  });
  if (!res.ok) return null;
  const items = await res.json() as Array<{ category?: string; buyValue?: string|number; sellValue?: string|number; netValue?: string|number }>;
  let fiiB=0, fiiS=0, fiiN=0, diiB=0, diiS=0, diiN=0;
  for (const it of items) {
    const cat = String(it.category ?? "").toLowerCase();
    if (/fii|fpi/.test(cat)) { fiiB=num(it.buyValue); fiiS=num(it.sellValue); fiiN=num(it.netValue); }
    else if (/dii/.test(cat)) { diiB=num(it.buyValue); diiS=num(it.sellValue); diiN=num(it.netValue); }
  }
  return { fiiEquityBuy:fiiB, fiiEquitySell:fiiS, fiiEquityNet:fiiN,
           diiEquityBuy:diiB, diiEquitySell:diiS, diiEquityNet:diiN };
}

async function fetchHistorical(from: string, to: string, cookie: string) {
  const f = toNseParam(from), t = toNseParam(to);
  const urls = [
    `https://www.nseindia.com/api/historical/fii-dii?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
    `https://www.nseindia.com/api/historicaldata-fiiDii?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { ...NSE_BASE, Referer: "https://www.nseindia.com/market-data/fii-dii-data", Cookie: cookie },
      });
      if (!res.ok) continue;
      const j = await res.json() as { data?: unknown[] } | unknown[];
      const arr = Array.isArray(j) ? j : (j as { data?: unknown[] }).data ?? [];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((item) => {
          const it = item as Record<string, unknown>;
          const date = parseNseDate(String(it.date ?? ""));
          if (!date) return null;
          return {
            date,
            fiiEquityBuy:  num(it.fiiBuyEquity),  fiiEquitySell: num(it.fiiSellEquity),
            fiiEquityNet:  num(it.fiiNetEquity),   diiEquityBuy:  num(it.diiBuyEquity),
            diiEquitySell: num(it.diiSellEquity),  diiEquityNet:  num(it.diiNetEquity),
            fiiDebtBuy:0, fiiDebtSell:0, fiiDebtNet:0, diiDebtBuy:0, diiDebtSell:0, diiDebtNet:0,
          };
        }).filter(Boolean);
      }
    } catch { /* ignore */ }
  }
  return [];
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveHistory(entries: unknown[]) {
  const sorted = [...entries].sort((a, b) => {
    const ae = a as { date: string }; const be = b as { date: string };
    return ae.date < be.date ? -1 : 1;
  });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(sorted, null, 2), "utf-8");
  return sorted;
}

function mergeEntries(existing: unknown[], incoming: unknown[]): unknown[] {
  const map = new Map<string, unknown>();
  for (const e of existing) { const x = e as {date:string}; map.set(x.date, e); }
  for (const e of incoming) { const x = e as {date:string}; map.set(x.date, e); }
  return [...map.values()];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[collect-flows] ${today} — starting`);

  let history = await loadHistory();
  console.log(`[collect-flows] loaded ${history.length} existing entries`);

  // Establish NSE session
  let cookie = "";
  try {
    cookie = await getNseCookies();
    console.log("[collect-flows] NSE session established");
  } catch (e) {
    console.error("[collect-flows] session error:", e);
  }

  // Fetch today's snapshot
  let snapshotEntry = null;
  if (cookie) {
    try {
      const snap = await fetchSnapshot(cookie);
      if (snap) {
        snapshotEntry = {
          date: today,
          ...snap,
          fiiDebtBuy:0, fiiDebtSell:0, fiiDebtNet:0,
          diiDebtBuy:0, diiDebtSell:0, diiDebtNet:0,
        };
        console.log(`[collect-flows] today snapshot: FII net=${snap.fiiEquityNet} DII net=${snap.diiEquityNet}`);
      }
    } catch (e) {
      console.error("[collect-flows] snapshot error:", e);
    }
  }

  // Attempt historical backfill for the current FY (April 1 onwards)
  const fyYear = new Date(today).getMonth() >= 3
    ? new Date(today).getFullYear()
    : new Date(today).getFullYear() - 1;
  const fyStart = `${fyYear}-04-01`;

  if (cookie) {
    try {
      console.log(`[collect-flows] attempting backfill from ${fyStart} to ${today}...`);
      const fetched = await fetchHistorical(fyStart, today, cookie);
      if (Array.isArray(fetched) && fetched.length > 0) {
        history = mergeEntries(history, fetched as unknown[]) as typeof history;
        console.log(`[collect-flows] backfill: ${fetched.length} entries merged`);
      } else {
        console.warn("[collect-flows] backfill returned 0 entries (NSE bot protection active)");
      }
    } catch (e) {
      console.error("[collect-flows] backfill error:", e);
    }
  }

  // Merge today's snapshot
  if (snapshotEntry) {
    history = mergeEntries(history, [snapshotEntry]) as typeof history;
  }

  const saved = await saveHistory(history);
  console.log(`[collect-flows] saved ${(saved as unknown[]).length} total entries`);

  // Print MTD / YTD summary
  const typedHistory = saved as Array<{date:string; fiiEquityNet:number; diiEquityNet:number}>;
  const ymToday = today.slice(0, 7);
  const fyStartStr = fyStart;
  const fiiMtd = typedHistory.filter(e => e.date.slice(0,7) === ymToday).reduce((s,e) => s + e.fiiEquityNet, 0);
  const fiiYtd = typedHistory.filter(e => e.date >= fyStartStr).reduce((s,e) => s + e.fiiEquityNet, 0);
  const diiMtd = typedHistory.filter(e => e.date.slice(0,7) === ymToday).reduce((s,e) => s + e.diiEquityNet, 0);
  const diiYtd = typedHistory.filter(e => e.date >= fyStartStr).reduce((s,e) => s + e.diiEquityNet, 0);
  console.log(`[collect-flows] FII MTD=${fiiMtd.toFixed(2)} YTD=${fiiYtd.toFixed(2)}`);
  console.log(`[collect-flows] DII MTD=${diiMtd.toFixed(2)} YTD=${diiYtd.toFixed(2)}`);
  console.log("[collect-flows] done");
}

main().catch((e) => {
  console.error("[collect-flows] fatal:", e);
  process.exit(1);
});
