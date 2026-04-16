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
 * Derive search terms from an NSE symbol so we can match news articles
 * that use the company name rather than the ticker.
 * e.g. RECLTD → ["RECLTD","REC"] | TATASTEEL → ["TATASTEEL","TATA"] | RAYMOND → ["RAYMOND"]
 */
function getSearchTerms(symbol: string): string[] {
  const terms = new Set([symbol]);
  const suffixes = [
    "BANK","FINSERV","FINSV","FIN","STEEL","CEMENT","CEM","POWER","ENERGY",
    "INFRA","TECH","TECHNOLOGIES","LTD","IND","INDUSTRIES","CORP","PHARMA",
    "PHARM","GAS","AUTO","MOTORS","LIFE","FERT","FOODS","FOOD","HOTEL",
    "HOTELS","MEDIA","DIGITAL","VENTURES","SOLUTIONS","SERVICES","SYSTEMS",
  ];
  for (const suf of suffixes) {
    if (symbol.endsWith(suf) && symbol.length > suf.length + 2) {
      terms.add(symbol.slice(0, symbol.length - suf.length));
    }
  }
  return [...terms].filter(t => t.length >= 3);
}

/**
 * Search market-news.json for articles mentioning a specific stock.
 * Matches on the NSE symbol AND common name variants derived from it
 * (e.g. RECLTD also matches "REC", TATASTEEL also matches "TATA").
 */
export function getStockNews(symbol: string, limit = 8): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string; content?: string }[] };
    const terms = getSearchTerms(symbol.toUpperCase());

    const matches = data.news.filter(n => {
      const title = (n.title ?? "").toUpperCase();
      const content = (n.content ?? "").toUpperCase();
      return terms.some(t => title.includes(t) || content.includes(t));
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

// Keywords that identify macro / broader-market news relevant to NIFTY/SENSEX analysis.
// Articles must contain at least one term from this list (checked in title + content).
const MARKET_NEWS_KEYWORDS = [
  // Indices
  "NIFTY","SENSEX","BSE 500","NSE 500","DALAL STREET","D-STREET","BENCHMARK",
  // Institutional flows
  "FII","DII","FPI","FOREIGN INSTITUTIONAL","DOMESTIC INSTITUTIONAL",
  "FOREIGN PORTFOLIO","NET BUYER","NET SELLER","INSTITUTIONAL BUYING","INSTITUTIONAL SELLING",
  // Macro / RBI / Policy
  "RBI","REPO RATE","REVERSE REPO","INFLATION","CPI","WPI","GDP","FISCAL DEFICIT",
  "MONETARY POLICY","MPC","RATE CUT","RATE HIKE","INTEREST RATE","LIQUIDITY",
  "FEDERAL RESERVE","FED RATE","US FED","FOMC","JEROME POWELL",
  // Bonds / Debt
  "BOND YIELD","G-SEC","GSEC","GILT","GOVERNMENT BOND","10-YEAR YIELD",
  "DEBT MARKET","BOND MARKET","TREASURY","T-BILL",
  // Commodities
  "CRUDE OIL","BRENT","WTI","CRUDE PRICE","OIL PRICE",
  "GOLD PRICE","SILVER PRICE","COMMODITY","BASE METAL","COPPER PRICE",
  // Currency / Forex
  "RUPEE","USD/INR","INR/USD","FOREX","DOLLAR INDEX","DXY","CURRENCY MARKET",
  // Global markets
  "DOW JONES","NASDAQ","S&P 500","S&P500","SHANGHAI","HANG SENG","NIKKEI",
  "GLOBAL MARKET","WORLD MARKET","EMERGING MARKET","ASIAN MARKET",
  // Broad market sentiment
  "STOCK MARKET","EQUITY MARKET","CAPITAL MARKET","MARKET RALLY","MARKET CRASH",
  "BEAR MARKET","BULL MARKET","MARKET SENTIMENT","MARKET MOOD","RISK-OFF","RISK-ON",
  "FOREIGN INFLOW","FOREIGN OUTFLOW","CAPITAL FLOW","MARKET FALL","MARKET RISE",
  // IPO market broadly (not individual IPOs)
  "IPO MARKET","PRIMARY MARKET","SME IPO MARKET",
];

/**
 * Returns macro/market-relevant news only — filters out company-specific articles.
 * Used exclusively for the MARKET-mode Smart Money Signal.
 */
export function getMarketNews(limit = 15): NewsHeadline[] {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as { news: { title: string; source?: string; pubDate: string; content?: string }[] };
    const matches = data.news.filter(n => {
      // Match on title only — content-body matching produces too many false positives
      // (unrelated articles incidentally mention financial terms in passing).
      const title = (n.title ?? "").toUpperCase();
      return MARKET_NEWS_KEYWORDS.some(kw => title.includes(kw));
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

// ── Headline classifier (server-side, deterministic) ──────────────────────────

const BULLISH_KW = [
  "RATE CUT","RATE CUTS","REPO RATE CUT","CUT RATES","RATE REDUCTION",
  "RALLY","RALLIES","SURGE","SURGES","JUMP","SOAR","SOARS","GAIN","GAINS",
  "BULL RUN","MARKET RISE","MARKET UP","STOCKS UP","INDICES UP","INDICES GAIN",
  "FII BUY","FPI BUY","FPI INFLOW","FII INFLOW","NET BUYER","NET BUYING",
  "INFLOWS","FOREIGN INFLOW","FOREIGN BUYING","INSTITUTIONAL BUYING",
  "GDP UPGRADE","GDP GROWTH","GROWTH BEATS","ABOVE ESTIMATE","BEATS ESTIMATE",
  "FDI INFLOW","REFORM","CAPEX BOOST","POLICY SUPPORT","FISCAL STIMULUS",
  "ORDER WIN","CONTRACT WIN","INDEX INCLUSION","ADDED TO INDEX",
  "RECOVERY","REBOUND","BOUNCE","OPTIMISM","RECORD HIGH","52-WEEK HIGH",
  "NIFTY RISES","NIFTY GAINS","SENSEX RISES","SENSEX GAINS","SENSEX UP","NIFTY UP",
];

const BEARISH_KW = [
  "SELL-OFF","SELLOFF","CRASH","SLUMP","FALLS","DROP","DROPS","DECLINE","DECLINES",
  "TUMBLE","TUMBLES","PLUNGE","PLUNGES","ROUT","TANKING","TANKS",
  "FII SELL","FPI SELL","FII SELLING","FPI SELLING","NET SELLER","NET SELLING",
  "OUTFLOWS","FOREIGN OUTFLOW","FOREIGN SELLING","INSTITUTIONAL SELLING",
  "WAR","CONFLICT","ESCALAT","SANCTION","PENALTY","TARIFF WAR","TRADE WAR",
  "EARNINGS MISS","PROFIT FALLS","BELOW ESTIMATE","MISSES ESTIMATE",
  "DOWNGRADE","DOWNGRADED","RATING CUT","TARGET CUT",
  "DEFAULT","DEBT STRESS","INSOLVENCY","BANKRUPTCY",
  "INFLATION RISES","INFLATION HIGH","RATE HIKE","POLICY TIGHTENING",
  "RUPEE FALLS","RUPEE WEAKENS","RUPEE DROPS","CURRENCY FALLS",
  "MARKET FALL","MARKET FALLS","STOCKS FALL","INDICES FALL",
  "NIFTY FALLS","NIFTY DOWN","SENSEX FALLS","SENSEX DOWN",
  "RISK-OFF","PANIC","FEAR","BLOODBATH",
];

function classifyHeadline(title: string): "bullish" | "bearish" | "neutral" {
  const t = title.toUpperCase();
  const isBullish = BULLISH_KW.some(kw => t.includes(kw));
  const isBearish = BEARISH_KW.some(kw => t.includes(kw));
  // Both signals cancel → neutral; neither → neutral
  if (isBullish && !isBearish) return "bullish";
  if (isBearish && !isBullish) return "bearish";
  return "neutral";
}

// ── Prompt Builders ────────────────────────────────────────────────────────────

export function buildMarketPrompt(data: MarketStreamData): string {
  const { fiiDii, newsHeadlines } = data;

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

  // Pre-classify headlines server-side — LLM receives facts, not a classification task
  const classified = newsHeadlines.map(n => ({ ...n, tone: classifyHeadline(n.title) }));
  const bullishCount = classified.filter(n => n.tone === "bullish").length;
  const bearishCount = classified.filter(n => n.tone === "bearish").length;
  const neutralCount = classified.filter(n => n.tone === "neutral").length;
  const dominantTone = bullishCount > bearishCount ? "BULLISH" : bearishCount > bullishCount ? "BEARISH" : "NEUTRAL";
  const dominantEmoji = dominantTone === "BULLISH" ? "🟢" : dominantTone === "BEARISH" ? "🔴" : "⚪";

  const topBullish = classified.find(n => n.tone === "bullish");
  const topBearish = classified.find(n => n.tone === "bearish");
  const topHeadlineForInsight = dominantTone === "BULLISH"
    ? (topBullish ? `"${topBullish.title}" [${topBullish.source}]` : "—")
    : dominantTone === "BEARISH"
    ? (topBearish ? `"${topBearish.title}" [${topBearish.source}]` : "—")
    : (topBullish ? `"${topBullish.title}" [${topBullish.source}]` : topBearish ? `"${topBearish.title}" [${topBearish.source}]` : "—");

  const newsBlock = newsHeadlines.length
    ? classified.map((n, i) => `${i + 1}. [${n.tone.toUpperCase()}] [${n.source}] ${n.title}`).join("\n")
    : "No market news available";

  // Determine FII/DII signal mechanically
  const fiiSignal =
    fiiSellingDays >= 5 && fiiCumulative < -3000 ? "🔴 BEARISH" :
    fiiSellingDays >= 3 && diiAbsorptionRatio >= 60 ? "⚪ NEUTRAL" :
    fiiCumulative > 2000 ? "🟢 BULLISH" :
    fiiCumulative >= -1000 ? "⚪ NEUTRAL" :
    "🔴 BEARISH";

  return `You are a senior equity analyst at Sunidhi Capital. Today: ${new Date().toISOString().split("T")[0]}.
Task: Produce a Smart Money Signal for NIFTY 50 / SENSEX. All classification is pre-computed — your job is to write clear, specific insights using the facts below.

━━━ PRE-COMPUTED SIGNALS (do NOT override or recompute) ━━━

FII/DII SIGNAL: ${fiiSignal}
- 7-day FII cumulative: ${fiiCumulative >= 0 ? "+" : ""}${fiiCumulative.toFixed(0)}Cr
- FII selling days: ${fiiSellingDays}/${fiiDii.length}
- 7-day DII cumulative: ${diiCumulative >= 0 ? "+" : ""}${diiCumulative.toFixed(0)}Cr
${diiAbsorptionRatio > 0 ? `- DII absorbed ${diiAbsorptionRatio}% of FII outflows` : ""}

NEWS SENTIMENT SIGNAL: ${dominantEmoji} ${dominantTone}
- Classified counts: ${bullishCount} bullish, ${bearishCount} bearish, ${neutralCount} neutral
- Most impactful headline: ${topHeadlineForInsight}

━━━ RULES ━━━
- Use the pre-computed signals above verbatim in your scorecard — do not change the signal icons or direction.
- FII/DII is the PRIMARY signal. If FII/DII and News conflict → final call follows FII/DII, confidence = MEDIUM.
- If both agree → final call follows both, confidence = HIGH.
- Cite exact ₹ figures from the data — no rounding, no paraphrasing.
BANNED PHRASES: "mixed signals", "cautious optimism", "remain watchful", "wait and watch", "market participants", "broader trends", "navigating", "could potentially"

━━━ OUTPUT FORMAT (follow exactly) ━━━

## Stream Scorecard
| Stream                | Signal | Key Fact |
|-----------------------|--------|----------|
| FII/DII Flows         | ${fiiSignal} | 7-day FII: ${fiiCumulative >= 0 ? "+" : ""}${fiiCumulative.toFixed(0)}Cr, ${fiiSellingDays}/${fiiDii.length} selling days${diiAbsorptionRatio > 0 ? `, DII absorbed ${diiAbsorptionRatio}%` : ""} |
| Market News Sentiment | ${dominantEmoji} ${dominantTone} | ${bullishCount} bullish, ${bearishCount} bearish — ${topHeadlineForInsight} |

## Stream Insights
Two sentences only. Start each with the exact label.

FII/DII Flows: [use the exact numbers above — FII cumulative ₹, selling days count, DII cumulative ₹, DII absorption %. State direction with "because".]
Market News Sentiment: [state "${bullishCount} bullish vs ${bearishCount} bearish headlines", cite the most impactful headline with source in brackets, and state what it implies for NIFTY.]

## Smart Money Signal
One sentence — start with BULLISH / BEARISH / NEUTRAL. Cite the specific ₹ figure or headline that drives the call.

## Confidence: HIGH / MEDIUM / LOW
Reason: [state whether FII/DII and news agree or conflict; if conflict, name the specific tension]

━━━ FULL DATA ━━━

FII/DII EQUITY FLOWS (${fiiDii.length} trading days):
${fiiBlock}

MARKET NEWS HEADLINES (pre-classified — ${newsHeadlines.length} total):
${newsBlock}

━━━ END ━━━`;
}

export function buildSymbolPrompt(data: SymbolStreamData): string {
  const { symbol, bulkBlockDeals, insiders, stockNews } = data;

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

CONVERGENCE RULE: If 2+ streams point the same direction → HIGH confidence. If streams conflict → MEDIUM confidence and explicitly state which streams diverge and why.

BANNED PHRASES: "mixed signals", "cautious optimism", "remain watchful", "wait and watch", "market participants", "broader market trends", "could potentially", "might possibly", "navigating"

━━━ OUTPUT FORMAT (follow exactly) ━━━

## Stream Scorecard
| Stream            | Signal | Key Fact |
|-------------------|--------|----------|
| Insider Activity  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [name + shares + stake change, or —] |
| Bulk/Block Deals  | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [institution name + side + ₹ value, or —] |
| Stock News        | 🟢 Bullish / 🔴 Bearish / ⚪ Neutral / — | [event type + source + price implication, or —] |

## Stream Insights
One sentence per stream that has data. Start with the exact label. No preamble, no numbering.

Insider Activity: [name the specific insider(s), their role/category, exact shares transacted and stake % change, and state the directional implication with the word "because" or "indicating"]
Bulk/Block Deals: [name the institution, exact ₹ value and side, and state what this positioning implies — "accumulating", "exiting", "taking profit"]
Stock News: [state the single most price-relevant event for ${symbol} from the news, cite the headline and source, and state the expected price direction with reasoning]

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

━━━ END ━━━`;
}
