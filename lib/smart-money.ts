import fs from "fs";
import path from "path";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FiiDiiDay {
  date: string;
  fiiEquityNet: number;
  diiEquityNet: number;
}

export interface NewsHeadline {
  title: string;
  source: string;
  pubDate: string;
}

/** Market-wide overview (NIFTY/SENSEX/broader) */
export interface MarketStreamData {
  mode: "market";
  fiiDii: FiiDiiDay[];
  newsHeadlines: NewsHeadline[];
  keyFilings: { date: string; company: string; title: string }[];
  dealFlow: {
    totalDeals: number;
    totalBuyCr: number;
    totalSellCr: number;
    netCr: number;
  };
}

/** Per-symbol analysis */
export interface SymbolStreamData {
  mode: "symbol";
  symbol: string;
  bulkBlockDeals: { date: string; client: string; side: string; quantity: number; valueCr: number }[];
  announcements: { date: string; title: string }[];
  fiiDii: FiiDiiDay[];
  insiders: InsiderDisclosure[];
}

export type StreamData = MarketStreamData | SymbolStreamData;

export interface CachedSignal {
  symbol: string;           // "MARKET" or NSE symbol
  rawData: StreamData;
  narrative: string;
  generatedAt: string;
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

// ── File readers ───────────────────────────────────────────────────────────────

const FII_DII_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");
const NEWS_PATH = path.join(process.cwd(), "data", "market-news.json");

export function getRecentFiiDii(days = 7): FiiDiiDay[] {
  try {
    const raw = fs.readFileSync(FII_DII_PATH, "utf-8");
    const all = JSON.parse(raw) as FiiDiiDay[];
    return all.slice(-days);
  } catch {
    return [];
  }
}

export function getRecentNews(limit = 10): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string }[] };
    return data.news.slice(0, limit).map(n => ({
      title: n.title,
      source: n.source ?? "Unknown",
      pubDate: n.pubDate,
    }));
  } catch {
    return [];
  }
}

// ── Prompt Builders ────────────────────────────────────────────────────────────

export function buildMarketPrompt(data: MarketStreamData): string {
  const { fiiDii, newsHeadlines, keyFilings, dealFlow } = data;

  const fiiBlock = fiiDii.length
    ? fiiDii.map(d =>
        `${d.date}: FII net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
      ).join("\n")
    : "No FII/DII data";

  const newsBlock = newsHeadlines.length
    ? newsHeadlines.map(n => `[${n.source}] ${n.title}`).join("\n")
    : "No market news";

  const filingsBlock = keyFilings.length
    ? keyFilings.map(f => `${f.date} | ${f.company}: ${f.title}`).join("\n")
    : "No recent filings";

  const dealBlock = dealFlow.totalDeals > 0
    ? `${dealFlow.totalDeals} institutional deals today | Buy: ₹${dealFlow.totalBuyCr.toFixed(0)}Cr | Sell: ₹${dealFlow.totalSellCr.toFixed(0)}Cr | Net: ${dealFlow.netCr >= 0 ? "+" : ""}${dealFlow.netCr.toFixed(0)}Cr`
    : "No bulk/block deal data for today";

  return `You are a senior equity analyst at Sunidhi Capital, an Indian research firm.

Synthesise the market intelligence below into a Smart Money Signal for the BROADER INDIAN MARKET (NIFTY 50 / SENSEX).

RULES:
- Only use the data provided. Never invent figures, names, or events.
- If a stream has no data, mark it "—" and exclude it from the verdict.
- Be specific: cite rupee figures, reference dates, name sources from the data.
- Convergence across streams = stronger signal. Flag divergence explicitly.
- Focus on the directional implication for NIFTY/SENSEX, not individual stocks.

OUTPUT FORMAT (follow exactly):

## Stream Scorecard
| Stream                  | Signal   | Key Fact |
|-------------------------|----------|----------|
| FII/DII Flows           | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| Institutional Deal Flow | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| Market News Sentiment   | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| BSE Filing Activity     | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |

## Smart Money Signal
Write exactly 3 sentences:

Sentence 1 — LEAD: What is the dominant institutional move? Name the actor, cite the figure, give the date.
Sentence 2 — CONNECT: What does a second stream confirm or contradict? Be plain about divergence.
Sentence 3 — IMPLICATION: What does this combination suggest for NIFTY/SENSEX direction? Do not hedge unless Confidence is LOW.

Write as if briefing a fund manager verbally. No jargon. No bullet points.

## Confidence: HIGH / MEDIUM / LOW
[HIGH = 3+ streams agree | MEDIUM = 2 streams agree | LOW = streams conflict or data sparse]
Reason: [one sentence]

--- MARKET DATA ---

FII/DII EQUITY FLOWS (last 7 days):
${fiiBlock}

INSTITUTIONAL BULK/BLOCK DEAL FLOW (today):
${dealBlock}

MARKET NEWS HEADLINES (most recent first):
${newsBlock}

KEY BSE/NSE FILINGS (recent):
${filingsBlock}

--- END ---`;
}

export function buildSymbolPrompt(data: SymbolStreamData): string {
  const { symbol, bulkBlockDeals, announcements, fiiDii, insiders } = data;

  const dealsBlock = bulkBlockDeals.length
    ? bulkBlockDeals.map(d =>
        `${d.date} | ${d.client} | ${d.side} | qty: ${d.quantity.toLocaleString()} | ₹${d.valueCr.toFixed(1)}Cr`
      ).join("\n")
    : "No bulk/block deals found today";

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
        `${i.date}: ${i.name} (${i.category}) — ${i.transactionType} ${i.sharesTransacted.toLocaleString()} shares | ${i.beforePct.toFixed(2)}% → ${i.afterPct.toFixed(2)}%`
      ).join("\n")
    : "No insider disclosures in last 90 days";

  return `You are a senior equity analyst at Sunidhi Capital, an Indian research firm.

Synthesise the market intelligence below for ${symbol} into a Smart Money Signal report.

RULES:
- Only use the data provided. Never invent figures, names, or events.
- If a stream has no data, mark it "—" and exclude it from the verdict.
- Be specific: name entities, cite rupee figures, reference dates from the data.
- Convergence across streams = stronger signal. Flag divergence explicitly.
- FII/DII data is market-wide, not stock-specific — use as macro context only.

OUTPUT FORMAT (follow exactly):

## Stream Scorecard
| Stream            | Signal   | Key Fact |
|-------------------|----------|----------|
| Insider Activity  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| Bulk/Block Deals  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |
| FII/DII Flows     | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [macro context] |
| BSE Announcements | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [one fact with figure] |

## Smart Money Signal
Write exactly 3 sentences:

Sentence 1 — LEAD: Who is the dominant actor and what are they doing for ${symbol}? Name figures. Be specific.
Sentence 2 — CONNECT: What does a second stream confirm or contradict?
Sentence 3 — IMPLICATION: What does this suggest directionally for ${symbol}? Do not hedge unless Confidence is LOW.

Write as if briefing a portfolio manager verbally. No jargon. No bullet points inside this section.

## Confidence: HIGH / MEDIUM / LOW
[HIGH = 3+ streams agree | MEDIUM = 2 streams agree or thin data | LOW = streams conflict or data sparse]
Reason: [one sentence]

--- MARKET DATA ---

BULK/BLOCK DEALS (today, ${symbol} only):
${dealsBlock}

BSE/NSE ANNOUNCEMENTS (${symbol}):
${announcementsBlock}

FII/DII MARKET FLOWS (last 7 days, aggregate market-wide):
${fiiBlock}

INSIDER TRADING DISCLOSURES (last 90 days, ${symbol}):
${insidersBlock}

--- END ---`;
}
