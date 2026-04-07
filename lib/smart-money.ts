import fs from "fs";
import path from "path";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FiiDiiDay {
  date: string;
  fiiEquityNet: number;
  diiEquityNet: number;
}

export interface StreamData {
  symbol: string;
  companyName: string;
  bulkBlockDeals: {
    date: string;
    client: string;
    side: string;
    quantity: number;
    valueCr: number;
  }[];
  announcements: {
    date: string;
    title: string;
  }[];
  fiiDii: FiiDiiDay[];        // last 5 days, market-wide
  insiders: InsiderDisclosure[];
}

export interface CachedSignal {
  symbol: string;
  companyName: string;
  rawData: StreamData;        // for immediate scorecard render
  narrative: string;          // full Ollama output
  generatedAt: string;        // ISO timestamp
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(process.cwd(), "data", "smart-money-cache.json");
const STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

type CacheStore = Record<string, CachedSignal>;

export function readCache(): CacheStore {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

export function writeCache(store: CacheStore): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(store, null, 2));
  } catch { /* disk error — silent */ }
}

export function getCached(symbol: string): CachedSignal | null {
  const store = readCache();
  const entry = store[symbol.toUpperCase()];
  if (!entry) return null;
  const age = Date.now() - new Date(entry.generatedAt).getTime();
  return age < STALE_MS ? entry : null;
}

export function setCached(signal: CachedSignal): void {
  const store = readCache();
  store[signal.symbol.toUpperCase()] = signal;
  writeCache(store);
}

// ── FII/DII reader ─────────────────────────────────────────────────────────────

const FII_DII_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");

export function getRecentFiiDii(days = 5): FiiDiiDay[] {
  try {
    const raw = fs.readFileSync(FII_DII_PATH, "utf-8");
    const all = JSON.parse(raw) as FiiDiiDay[];
    return all.slice(-days);
  } catch {
    return [];
  }
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────

export function buildPrompt(data: StreamData): string {
  const { symbol, companyName, bulkBlockDeals, announcements, fiiDii, insiders } = data;

  const dealsBlock = bulkBlockDeals.length
    ? bulkBlockDeals.map(d =>
        `${d.date} | ${d.client} | ${d.side} | ${(d.quantity / 1e7).toFixed(2)}Cr shares | ₹${d.valueCr.toFixed(1)}Cr`
      ).join("\n")
    : "No bulk/block deals in last 7 days";

  const announcementsBlock = announcements.length
    ? announcements.map(a => `${a.date}: ${a.title}`).join("\n")
    : "No recent announcements";

  const fiiBlock = fiiDii.length
    ? fiiDii.map(d =>
        `${d.date}: FII net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
      ).join("\n")
    : "No FII/DII data";

  const insidersBlock = insiders.length
    ? insiders.map(i =>
        `${i.date}: ${i.name} (${i.category}) — ${i.transactionType} ${i.sharesTransacted.toLocaleString()} shares | holding: ${i.beforePct.toFixed(2)}% → ${i.afterPct.toFixed(2)}%`
      ).join("\n")
    : "No insider disclosures in last 90 days";

  return `You are a senior equity analyst assistant for Sunidhi Capital, an Indian research firm.

Synthesise the market intelligence below for ${symbol} (${companyName}) into a Smart Money Signal report.

RULES:
- Only use the data provided. Never invent figures, names, or events.
- If a stream has no data, mark it "—" and exclude it from the verdict.
- Be specific: name entities, cite rupee figures, reference dates from the data.
- Convergence across streams = stronger signal. Flag divergence explicitly.

OUTPUT FORMAT (follow exactly):

## Stream Scorecard
| Stream            | Signal   | Key Fact |
|-------------------|----------|----------|
| Insider Activity  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| Bulk/Block Deals  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| FII/DII Flows     | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| BSE Announcements | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |

## Smart Money Signal
Write exactly 3 sentences:

Sentence 1 — LEAD: Who is the dominant actor and what are they doing? Name figures. Be specific.
Sentence 2 — CONNECT: What does a second stream confirm or contradict? If streams conflict, say so plainly — do not paper over divergence.
Sentence 3 — IMPLICATION: What does this combination suggest directionally? Do not hedge with "may" or "could" unless Confidence is LOW.

Write as if briefing a portfolio manager verbally. No jargon. No bullet points inside this section.

## Confidence: HIGH / MEDIUM / LOW
[HIGH = 3+ streams agree | MEDIUM = 2 streams agree or thin data | LOW = streams conflict or data sparse]
Reason: [one sentence]

--- MARKET DATA ---

BULK/BLOCK DEALS (last 7 days):
${dealsBlock}

BSE ANNOUNCEMENTS (recent):
${announcementsBlock}

FII/DII MARKET FLOWS (last 5 days, aggregate market-wide):
${fiiBlock}

INSIDER TRADING DISCLOSURES (last 90 days):
${insidersBlock}

--- END ---`;
}
