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

  // FII trend: show net flow per day + 7-day cumulative
  const fiiCumulative = fiiDii.reduce((s, d) => s + d.fiiEquityNet, 0);
  const diiCumulative = fiiDii.reduce((s, d) => s + d.diiEquityNet, 0);
  const fiiBlock = fiiDii.length
    ? fiiDii.map(d =>
        `${d.date}: FII ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr | DII ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr`
      ).join("\n") +
      `\n7-day cumulative: FII ${fiiCumulative >= 0 ? "+" : ""}${fiiCumulative.toFixed(0)}Cr | DII ${diiCumulative >= 0 ? "+" : ""}${diiCumulative.toFixed(0)}Cr`
    : "No FII/DII data";

  // News: all headlines for sentiment synthesis
  const newsBlock = newsHeadlines.length
    ? newsHeadlines.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n")
    : "No market news available";

  // Filings: group by type for meaningful signal
  const filingsByType = keyFilings.reduce<Record<string, string[]>>((acc, f) => {
    const type = f.title || "General";
    if (!acc[type]) acc[type] = [];
    acc[type].push(f.company);
    return acc;
  }, {});
  const filingsBlock = Object.keys(filingsByType).length
    ? Object.entries(filingsByType)
        .map(([type, companies]) => `${type} (${companies.length}): ${companies.slice(0, 4).join(", ")}${companies.length > 4 ? "…" : ""}`)
        .join("\n")
    : "No recent filings";

  const dealBlock = dealFlow.totalDeals > 0
    ? `${dealFlow.totalDeals} deals today | Institutional Buy: ₹${dealFlow.totalBuyCr.toFixed(0)}Cr | Sell: ₹${dealFlow.totalSellCr.toFixed(0)}Cr | Net: ${dealFlow.netCr >= 0 ? "+" : ""}${dealFlow.netCr.toFixed(0)}Cr`
    : "No bulk/block deal data for today";

  return `You are a senior equity analyst at Sunidhi Capital, an Indian research firm. Today's date: ${new Date().toISOString().split("T")[0]}.

Your job: synthesise the four data streams below into a Smart Money Signal for NIFTY 50 / SENSEX. Be direct and specific — a fund manager needs to act on this.

CRITICAL RULES:
1. Use ONLY the data provided. Do not invent figures.
2. For FII/DII: interpret the trend (sustained selling = bearish, DII absorption = support).
3. For News: read ALL ${newsHeadlines.length} headlines and judge the overall market tone. You MUST output Bullish/Bearish/Neutral — never "—" when headlines exist. Pick the dominant theme.
4. For Deal Flow: net positive = institutions buying = bullish signal.
5. For Filings: Board Meetings/Financial Results = high activity. Interpret volume and type.
6. Be specific: cite ₹ figures, dates, company names, sources from the data.

OUTPUT FORMAT (follow exactly, no deviations):

## Stream Scorecard
| Stream                  | Signal | Key Fact |
|-------------------------|--------|----------|
| FII/DII Flows           | 🟢 or 🔴 or ⚪ | [specific figure + date] |
| Institutional Deal Flow | 🟢 or 🔴 or ⚪ | [specific figure] |
| Market News Sentiment   | 🟢 or 🔴 or ⚪ | [2-3 dominant themes from the headlines: cite headline titles and sources. Format: "Theme 1 (Source); Theme 2 (Source); Theme 3 (Source)"] |
| Corporate Activity      | 🟢 or 🔴 or ⚪ | [filing type count + notable company] |

## Smart Money Signal
[Sentence 1 — LEAD] Name the dominant actor and their exact position. Example: "FIIs sold a net ₹X,XXXCr over 7 days while DIIs absorbed ₹X,XXXCr."
[Sentence 2 — CONNECT] How does a second stream confirm or contradict? Name the stream and its figure.
[Sentence 3 — VERDICT] Direct call on NIFTY/SENSEX direction. Commit to a view.

## Confidence: HIGH / MEDIUM / LOW
Reason: [one sentence citing which streams agree/disagree]

--- DATA ---

FII/DII EQUITY FLOWS (${fiiDii.length} days):
${fiiBlock}

INSTITUTIONAL BULK/BLOCK DEAL FLOW:
${dealBlock}

MARKET NEWS HEADLINES (${newsHeadlines.length} items — synthesise the overall sentiment):
${newsBlock}

CORPORATE FILINGS ACTIVITY:
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
