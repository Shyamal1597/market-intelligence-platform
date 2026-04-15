import fs from "fs";
import path from "path";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FiiDiiDay {
  date: string;
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
}

export interface NewsHeadline {
  title: string;
  source: string;
  pubDate: string;
  content?: string;   // article snippet, ~200 chars, may be empty
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
    topDeals: { institution: string; side: string; symbol: string; valueCr: number }[];
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
  stockNews: NewsHeadline[];  // articles from market-news.json mentioning this stock
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

/**
 * Search market-news.json for articles mentioning a specific stock symbol.
 * Matches against title and content (case-insensitive).
 * Returns up to `limit` most recent matching articles.
 */
export function getStockNews(symbol: string, limit = 8): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string; content?: string }[] };
    const sym = symbol.toUpperCase();
    // Match symbol in title or content (case-insensitive)
    const matches = data.news.filter(n => {
      const title = n.title?.toUpperCase() ?? "";
      const content = n.content?.toUpperCase() ?? "";
      return title.includes(sym) || content.includes(sym);
    });
    return matches.slice(0, limit).map(n => ({
      title: n.title,
      source: n.source ?? "Unknown",
      pubDate: n.pubDate,
      content: n.content && n.content.length > 20 ? n.content.slice(0, 220) : undefined,
    }));
  } catch {
    return [];
  }
}

export function getRecentNews(limit = 10): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string; content?: string }[] };
    return data.news
      .slice(0, limit)
      .map(n => ({
        title: n.title,
        source: n.source ?? "Unknown",
        pubDate: n.pubDate,
        content: n.content && n.content.length > 20 ? n.content.slice(0, 220) : undefined,
      }));
  } catch {
    return [];
  }
}

// ── Prompt Builders ────────────────────────────────────────────────────────────

export function buildMarketPrompt(data: MarketStreamData): string {
  const { fiiDii, newsHeadlines, keyFilings, dealFlow } = data;

  // FII/DII: per-day buy/sell breakdown + 7-day cumulative
  const fiiCumulative = fiiDii.reduce((s, d) => s + d.fiiEquityNet, 0);
  const diiCumulative = fiiDii.reduce((s, d) => s + d.diiEquityNet, 0);
  const fiiSellingDays = fiiDii.filter(d => d.fiiEquityNet < 0).length;
  const diiAbsorptionRatio = fiiCumulative < 0 && diiCumulative > 0
    ? Math.min(100, Math.round((diiCumulative / Math.abs(fiiCumulative)) * 100))
    : 0;

  const fiiBlock = fiiDii.length
    ? fiiDii.map(d =>
        `${d.date}: FII net ${d.fiiEquityNet >= 0 ? "+" : ""}${d.fiiEquityNet.toFixed(0)}Cr (buy ₹${d.fiiEquityBuy.toFixed(0)}Cr / sell ₹${d.fiiEquitySell.toFixed(0)}Cr) | DII net ${d.diiEquityNet >= 0 ? "+" : ""}${d.diiEquityNet.toFixed(0)}Cr (buy ₹${d.diiEquityBuy.toFixed(0)}Cr / sell ₹${d.diiEquitySell.toFixed(0)}Cr)`
      ).join("\n") +
      `\n7-day cumulative: FII ${fiiCumulative >= 0 ? "+" : ""}${fiiCumulative.toFixed(0)}Cr | DII ${diiCumulative >= 0 ? "+" : ""}${diiCumulative.toFixed(0)}Cr` +
      `\nFII selling days: ${fiiSellingDays}/${fiiDii.length}` +
      (diiAbsorptionRatio > 0 ? ` | DII absorbed ${diiAbsorptionRatio}% of FII outflows` : "")
    : "No FII/DII data";

  // News: all headlines with full snippets
  const newsBlock = newsHeadlines.length
    ? newsHeadlines.slice(0, 8).map((n, i) => {
        const snippet = n.content ? ` — ${n.content}` : "";
        return `${i + 1}. [${n.source}] ${n.title}${snippet}`;
      }).join("\n") +
      (newsHeadlines.length > 8 ? `\n(+${newsHeadlines.length - 8} more headlines not shown)` : "")
    : "No market news available";

  // Filings: grouped by type with counts
  const filingsByType = keyFilings.reduce<Record<string, string[]>>((acc, f) => {
    const type = f.title || "General";
    if (!acc[type]) acc[type] = [];
    acc[type].push(f.company);
    return acc;
  }, {});
  const filingsBlock = Object.keys(filingsByType).length
    ? Object.entries(filingsByType)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([type, companies]) => `${type} (${companies.length}): ${companies.slice(0, 5).join(", ")}${companies.length > 5 ? `… +${companies.length - 5} more` : ""}`)
        .join("\n")
    : "No recent filings";

  const dealBlock = dealFlow.totalDeals > 0
    ? [
        `${dealFlow.totalDeals} deals | Buy ₹${dealFlow.totalBuyCr.toFixed(0)}Cr | Sell ₹${dealFlow.totalSellCr.toFixed(0)}Cr | Net ${dealFlow.netCr >= 0 ? "+" : ""}${dealFlow.netCr.toFixed(0)}Cr`,
        ...(dealFlow.topDeals?.length
          ? dealFlow.topDeals.slice(0, 8).map(d =>
              `  ${d.side} | ${d.institution || "Unknown"} | ${d.symbol} | ₹${d.valueCr.toFixed(1)}Cr`
            )
          : [])
      ].join("\n")
    : "No bulk/block deal data for today";

  return `You are a senior equity analyst at Sunidhi Capital. Today: ${new Date().toISOString().split("T")[0]}.
Task: Produce a Smart Money Signal for NIFTY 50 / SENSEX from the four data streams below.

━━━ HARD INTERPRETATION RULES ━━━

FII/DII RULES (apply these mechanically):
- FII selling for 5+ of 7 days AND cumulative < -3000Cr → 🔴 BEARISH regardless of DII
- FII selling for 3-4 days AND DII absorption ≥ 60% → ⚪ NEUTRAL (DII providing floor)
- FII cumulative > +2000Cr over 7 days → 🟢 BULLISH
- FII cumulative -1000 to +2000Cr → ⚪ NEUTRAL
- Always cite the exact 7-day FII cumulative ₹ figure and DII absorption % in your insight

DEAL FLOW RULES:
- Net institutional > +300Cr → 🟢 BULLISH (institutions accumulating)
- Net institutional < -300Cr → 🔴 BEARISH (distribution)
- -300Cr to +300Cr → ⚪ NEUTRAL
- If a single institution buys > ₹200Cr in one deal, that is a HIGH-CONVICTION entry — name them
- Name the top institution explicitly, do not say "various institutions"

NEWS SENTIMENT RULES:
- Count bullish vs bearish themes across ALL ${newsHeadlines.length} headlines
- Bullish: rate cuts, earnings beat, capex plans, govt reform, M&A activity, order wins
- Bearish: rate hikes, earnings miss, regulatory crackdown, FII exodus, geopolitical conflict, debt stress
- If ≥60% headlines lean one way → assign that signal. 40-60% split → ⚪ NEUTRAL
- Cite the SPECIFIC headline title and source that most strongly drives the signal
- Never output "—" for News Sentiment when headlines exist

CORPORATE FILINGS RULES:
- >15 Board Meeting filings in one day = earnings season (⚪ NEUTRAL — routine)
- Rights Issue / QIP = dilution risk (🔴 slightly BEARISH for existing holders)
- Dividend / Buyback = capital return (🟢 BULLISH)
- Merger / Demerger / Open Offer = corporate action (🟢 BULLISH for target)
- Name the most significant company in the dominant filing type

BANNED PHRASES — never use these: "mixed signals", "cautious optimism", "remain watchful", "wait and watch", "market participants", "broader trends", "navigating uncertainty", "could potentially", "might possibly", "uncertain environment"

━━━ OUTPUT FORMAT (follow exactly) ━━━

## Stream Scorecard
| Stream                  | Signal | Key Fact |
|-------------------------|--------|----------|
| FII/DII Flows           | 🟢 or 🔴 or ⚪ | [7-day FII cumulative ₹ + DII absorption % + trend direction] |
| Institutional Deal Flow | 🟢 or 🔴 or ⚪ | [net ₹ + top institution name + action] |
| Market News Sentiment   | 🟢 or 🔴 or ⚪ | [dominant theme + specific headline title (Source)] |
| Corporate Activity      | 🟢 or 🔴 or ⚪ | [dominant filing type count + most notable company] |

## Stream Insights
One sentence per stream. Start each line with the exact label. No preamble, no numbering, no hedging.

FII/DII Flows: [cite exact 7-day cumulative ₹ figures for FII and DII, number of consecutive selling days, and state the directional implication with causal language — "because", "driven by", "resulting in"]
Institutional Deal Flow: [name the single largest institution, their exact action and ₹ value, and state what this positioning implies for market direction]
Market News Sentiment: [name the dominant theme, cite 1-2 specific headline titles with their sources, state what price impact this implies]
Corporate Activity: [state the dominant filing type with exact count, name the most significant company, explain what this filing activity signals about earnings or corporate momentum]

## Smart Money Signal
One sentence — a direct, actionable verdict on NIFTY/SENSEX direction. Lead with the direction (BULLISH/BEARISH/NEUTRAL), then cite the single strongest data point. No hedging if Confidence is HIGH or MEDIUM.

## Confidence: HIGH / MEDIUM / LOW
Reason: [one sentence — state which streams converge or diverge and why that drives your confidence level]

━━━ DATA ━━━

FII/DII EQUITY FLOWS (${fiiDii.length} trading days):
${fiiBlock}

INSTITUTIONAL BULK/BLOCK DEAL FLOW:
${dealBlock}

MARKET NEWS HEADLINES (${newsHeadlines.length} total):
${newsBlock}

CORPORATE FILINGS ACTIVITY:
${filingsBlock}

━━━ END ━━━`;
}

export function buildSymbolPrompt(data: SymbolStreamData): string {
  const { symbol, bulkBlockDeals, announcements, insiders, stockNews } = data;

  // Only actual transactions — filter 0-share disclosure artifacts
  const activeInsiders = insiders.filter(i => i.sharesTransacted > 0);

  // Compute insider conviction signals
  const promoterBuys = activeInsiders.filter(i => i.transactionType === "Buy" && (i.category?.toLowerCase().includes("promoter") || i.category?.toLowerCase().includes("director")));
  const insiderSells = activeInsiders.filter(i => i.transactionType === "Sell");
  const totalInsiderBuyShares = activeInsiders.filter(i => i.transactionType === "Buy").reduce((s, i) => s + i.sharesTransacted, 0);
  const totalInsiderSellShares = insiderSells.reduce((s, i) => s + i.sharesTransacted, 0);

  const insidersBlock = activeInsiders.length
    ? activeInsiders.map(i => {
        const stakeChange = (i.afterPct - i.beforePct).toFixed(3);
        const direction = parseFloat(stakeChange) > 0 ? "▲" : "▼";
        return `${i.date} | ${i.name} | ${i.category} | ${i.transactionType} ${i.sharesTransacted.toLocaleString()} shares | stake: ${i.beforePct.toFixed(3)}% → ${i.afterPct.toFixed(3)}% (${direction}${Math.abs(parseFloat(stakeChange)).toFixed(3)}%)`;
      }).join("\n") +
      `\nSummary: ${promoterBuys.length} promoter/director buy(s), ${insiderSells.length} sell(s) | Net buy shares: ${(totalInsiderBuyShares - totalInsiderSellShares).toLocaleString()}`
    : "No insider transactions in last 90 days";

  const dealsBlock = bulkBlockDeals.length
    ? bulkBlockDeals.map(d =>
        `${d.date} | ${d.side} | ${d.client} | qty: ${d.quantity.toLocaleString()} shares | ₹${d.valueCr.toFixed(1)}Cr`
      ).join("\n")
    : "No bulk/block deals found today";

  const announcementsBlock = announcements.length
    ? announcements.map(a => `${a.date}: ${a.title}`).join("\n")
    : "No recent announcements";

  const newsBlock = stockNews.length
    ? stockNews.slice(0, 6).map((n, i) => {
        const snippet = n.content ? ` — ${n.content}` : "";
        return `${i + 1}. [${n.source}] ${n.title}${snippet}`;
      }).join("\n")
    : `No recent news found mentioning ${symbol}`;

  return `You are a senior equity analyst at Sunidhi Capital. Today: ${new Date().toISOString().split("T")[0]}.
Task: Produce a Smart Money Signal for ${symbol} from the four data streams below.

━━━ HARD INTERPRETATION RULES ━━━

INSIDER ACTIVITY RULES:
- Promoter or Director BUYING > 10,000 shares = 🟢 HIGH CONVICTION BULLISH — they have inside knowledge of fundamentals; name them and state exact stake increase
- Multiple insiders (2+) buying simultaneously = 🟢 VERY BULLISH — convergent insider confidence
- KMP or Director SELLING > 0.5% of their stake = 🔴 BEARISH — note timing vs results dates
- Pledge creation by promoter = 🔴 BEARISH (funding stress signal)
- "Other" category with any shares = interpret based on direction (buy/sell)
- Net buy shares > net sell shares → lean bullish despite mixed activity
- NEVER skip this stream if any data exists

BULK/BLOCK DEALS RULES:
- Named institution (Mutual Fund, FII, Insurance company) BUY > ₹50Cr = 🟢 BULLISH conviction entry — name the institution
- Named institution SELL > ₹50Cr = 🔴 BEARISH distribution — note if at discount to CMP
- Multiple institutions buying same stock same day = 🟢 VERY BULLISH
- HNI / individual name without institutional tag = ⚪ NEUTRAL signal weight
- State the largest single deal ₹ value and buyer/seller name explicitly

STOCK NEWS RULES — read every article and extract the most price-relevant event:
- Results beat (revenue/profit above estimates) = 🟢 BULLISH — quantify the beat if figures are in the text
- Results miss = 🔴 BEARISH — quantify
- Large order win / contract announcement = 🟢 BULLISH — state contract value if mentioned
- SEBI notice / regulatory action / government penalty = 🔴 BEARISH — state the penalty/action
- Management guidance upgrade = 🟢 BULLISH; downgrade = 🔴 BEARISH
- M&A: being acquired/merged = 🟢 BULLISH (premium); acquiring = ⚪ NEUTRAL (depends on price)
- Debt restructuring / default risk = 🔴 BEARISH
- If no news: mark "—" and skip insight

BSE/NSE ANNOUNCEMENTS RULES:
- Board Meeting to consider results → earnings imminent (⚪ NEUTRAL — watch for result)
- Dividend announcement = 🟢 BULLISH (yield support)
- Buyback = 🟢 BULLISH (undervaluation signal by management)
- Rights Issue / QIP = 🔴 slightly BEARISH (dilution)
- Merger target / Open Offer = 🟢 BULLISH (M&A premium)
- Name the specific announcement type and date

CONVERGENCE RULE: If 2+ streams point the same direction → HIGH confidence. If streams conflict → MEDIUM confidence and explicitly state which streams diverge and why.

BANNED PHRASES: "mixed signals", "cautious optimism", "remain watchful", "wait and watch", "market participants", "broader market trends", "could potentially", "might possibly", "navigating"

━━━ OUTPUT FORMAT (follow exactly) ━━━

## Stream Scorecard
| Stream            | Signal | Key Fact |
|-------------------|--------|----------|
| Insider Activity  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [name + shares + stake change, or —] |
| Bulk/Block Deals  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [institution name + side + ₹ value, or —] |
| Stock News        | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [event type + source + price implication, or —] |
| BSE Announcements | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [filing type + date + implication, or —] |

## Stream Insights
One sentence per stream that has data. Start with the exact label. No preamble, no numbering.

Insider Activity: [name the specific insider(s), their role/category, exact shares transacted and stake % change, and state the directional implication with the word "because" or "indicating"]
Bulk/Block Deals: [name the institution, exact ₹ value and side, and state what this positioning implies — "accumulating", "exiting", "taking profit"]
Stock News: [state the single most price-relevant event for ${symbol} from the news, cite the headline and source, and state the expected price direction with reasoning]
BSE Announcements: [name the specific announcement type, company, date, and state what it signals for near-term price action]

## Smart Money Signal
One sentence — lead with BULLISH / BEARISH / NEUTRAL, then cite the single strongest convergent data point with a ₹ figure or % or name. No hedging if Confidence is HIGH or MEDIUM.

## Confidence: HIGH / MEDIUM / LOW
Reason: [state exactly how many streams converge, which direction, and what the key risk to this call is]

━━━ DATA ━━━

INSIDER TRADING DISCLOSURES — ${symbol} (last 90 days):
${insidersBlock}

BULK/BLOCK DEALS — ${symbol} (today):
${dealsBlock}

RECENT NEWS — articles mentioning ${symbol} (${stockNews.length} found):
${newsBlock}

BSE/NSE ANNOUNCEMENTS — ${symbol}:
${announcementsBlock}

━━━ END ━━━`;
}
