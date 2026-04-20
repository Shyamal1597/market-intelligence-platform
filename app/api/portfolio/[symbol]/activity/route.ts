// app/api/portfolio/[symbol]/activity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSearchTerms } from "@/lib/smart-money";
import { fetchNSEFilings } from "@/lib/nse-filings";
import { fetchBulkDeals, fetchBlockDeals, fetchShortDeals } from "@/lib/nse-deals";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const NEWS_PATH = path.join(process.cwd(), "data", "market-news.json");

// Common aliases for well-known NSE symbols — maps symbol → extra search terms
// These are abbreviations/names that appear in news articles but not in NSE tickers
const SYMBOL_ALIASES: Record<string, string[]> = {
  RELIANCE:    ["RIL", "RELIANCE INDUSTRIES", "RELIANCE JIO", "MUKESH AMBANI"],
  HDFCBANK:    ["HDFC BANK", "HDFC BANK LTD"],
  ICICIBANK:   ["ICICI BANK", "ICICI BANK LTD"],
  SBIN:        ["SBI", "STATE BANK", "STATE BANK OF INDIA"],
  TCS:         ["TATA CONSULTANCY", "TATA CONSULTANCY SERVICES"],
  INFY:        ["INFOSYS", "INFOSYS LTD"],
  WIPRO:       ["WIPRO LTD", "WIPRO LIMITED"],
  HCLTECH:     ["HCL TECH", "HCL TECHNOLOGIES"],
  TATAMOTORS:  ["TATA MOTORS", "TATA MOTORS LTD"],
  TATASTEEL:   ["TATA STEEL", "TATA STEEL LTD"],
  TATACONSUM:  ["TATA CONSUMER", "TATA CONSUMER PRODUCTS"],
  BAJFINANCE:  ["BAJAJ FINANCE", "BAJAJ FINANCE LTD"],
  BAJAJFINSV:  ["BAJAJ FINSERV", "BAJAJ FINSERV LTD"],
  AXISBANK:    ["AXIS BANK", "AXIS BANK LTD"],
  KOTAKBANK:   ["KOTAK BANK", "KOTAK MAHINDRA BANK"],
  INDUSINDBK:  ["INDUSIND BANK", "INDUSIND"],
  LT:          ["LARSEN", "L&T", "LARSEN & TOUBRO"],
  ONGC:        ["OIL AND NATURAL GAS", "ONGC LTD"],
  NTPC:        ["NTPC LTD", "NTPC LIMITED"],
  POWERGRID:   ["POWER GRID", "POWER GRID CORP"],
  ADANIENT:    ["ADANI ENTERPRISES", "ADANI GROUP"],
  ADANIPORTS:  ["ADANI PORTS", "ADANI PORTS AND SEZ"],
  ADANIGREEN:  ["ADANI GREEN", "ADANI GREEN ENERGY"],
  ADANIPOWER:  ["ADANI POWER"],
  MARUTI:      ["MARUTI SUZUKI", "MARUTI SUZUKI INDIA"],
  BHARTIARTL:  ["BHARTI AIRTEL", "AIRTEL"],
  JSWSTEEL:    ["JSW STEEL", "JSW STEEL LTD"],
  HINDALCO:    ["HINDALCO INDUSTRIES", "HINDALCO"],
  COALINDIA:   ["COAL INDIA", "COAL INDIA LTD"],
  SUNPHARMA:   ["SUN PHARMA", "SUN PHARMACEUTICAL"],
  DRREDDY:     ["DR REDDY", "DR. REDDY'S"],
  CIPLA:       ["CIPLA LTD", "CIPLA LIMITED"],
  DIVISLAB:    ["DIVI'S LAB", "DIVIS LABORATORIES"],
  ULTRACEMCO:  ["ULTRATECH CEMENT", "ULTRATECH"],
  GRASIM:      ["GRASIM INDUSTRIES", "GRASIM"],
  ASIANPAINT:  ["ASIAN PAINTS", "ASIAN PAINTS LTD"],
  NESTLEIND:   ["NESTLE INDIA", "NESTLE"],
  TITAN:       ["TITAN COMPANY", "TITAN CO"],
  ITC:         ["ITC LTD", "ITC LIMITED"],
  M_M:         ["MAHINDRA", "M&M", "MAHINDRA & MAHINDRA"],
  EICHERMOT:   ["EICHER MOTORS", "ROYAL ENFIELD"],
  BPCL:        ["BHARAT PETROLEUM", "BPCL LTD"],
  IOCL:        ["INDIAN OIL", "INDIAN OIL CORP"],
  RECLTD:      ["REC", "REC LIMITED", "RURAL ELECTRIFICATION"],
  PFC:         ["POWER FINANCE", "POWER FINANCE CORP"],
  SBILIFE:     ["SBI LIFE", "SBI LIFE INSURANCE"],
  HDFCLIFE:    ["HDFC LIFE", "HDFC LIFE INSURANCE"],
  ICICIlombard:["ICICI LOMBARD", "ICICI LOMBARD GIC"],
  ICICIPRU:    ["ICICI PRUDENTIAL", "ICICI PRU"],
  SHRIRAMFIN:  ["SHRIRAM FINANCE", "SHRIRAM"],
  JIOFIN:      ["JIO FINANCIAL", "JIO FINANCE"],
  ETERNAL:     ["ZOMATO"],
  NYKAA:       ["FSN E-COMMERCE", "NYKAA"],
  PAYTM:       ["ONE97 COMMUNICATIONS", "PAYTM"],
  DMART:       ["AVENUE SUPERMARTS", "D-MART"],
};

// Builds all search terms for a symbol: NSE ticker variants + known aliases
function buildSearchTerms(symbol: string): string[] {
  const base = getSearchTerms(symbol);               // suffix-stripping variants
  const aliases = [...(SYMBOL_ALIASES[symbol] ?? [])];
  // Handle M&M specially — symbol is "M&M" in NSE
  if (symbol === "M&M") aliases.push(...(SYMBOL_ALIASES["M_M"] ?? []));
  return [...new Set([...base, ...aliases])];
}

// NSE RSS filings may use either the NSE ticker OR the full company name in the
// "SYMBOL : Description" title format. Match both the ticker and all known
// long-form aliases against the filing's scripCode field.
function matchesFiling(scripCode: string, sym: string): boolean {
  const sc = scripCode.toUpperCase().trim();
  if (sc === sym) return true;                      // exact ticker match
  const aliases = SYMBOL_ALIASES[sym] ?? [];
  return aliases.some((alias) =>
    alias.length >= 6                              // avoid short-term false positives
      ? sc.includes(alias)                         // "STATE BANK OF INDIA" ⊆ "State Bank Of India Limited"
      : sc === alias                               // short alias: must be exact
  );
}

function getPortfolioNews(symbol: string, limit = 15) {
  try {
    const raw = fs.readFileSync(NEWS_PATH, "utf-8");
    const data = JSON.parse(raw) as {
      news: { title: string; source?: string; pubDate: string; link?: string; content?: string }[];
    };
    const terms = buildSearchTerms(symbol.toUpperCase());

    const matches = data.news.filter((n) => {
      const title = (n.title ?? "").toUpperCase();
      // Title-only match: if the article title doesn't mention the company,
      // it's not primarily about it — content search causes too many false positives
      // (generic "stocks to watch" articles mention every company in the body).
      return terms.some((t) => title.includes(t));
    });

    // De-dupe by title in case the same article appears twice
    const seen = new Set<string>();
    return matches
      .filter((n) => {
        const key = n.title?.trim() ?? "";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((n) => ({
        title: n.title,
        source: n.source ?? "Unknown",
        pubDate: n.pubDate,
        link: n.link ?? null,
      }));
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().trim();

  const [filingsResult, bulkResult, blockResult, shortResult] =
    await Promise.allSettled([
      fetchNSEFilings(500),
      fetchBulkDeals(),
      fetchBlockDeals(),
      fetchShortDeals(),
    ]);

  const newsItems = getPortfolioNews(sym, 15);

  const filings =
    filingsResult.status === "fulfilled"
      ? filingsResult.value
          // Match on ticker OR full company name via aliases (NSE RSS uses both formats)
          .filter((f) => matchesFiling(f.scripCode, sym))
          .slice(0, 20)
          .map((f) => ({
            id: f.id,
            company: f.company,
            filingType: f.filingType,
            description: f.description,
            pdfUrl: f.pdfUrl,
            submittedAt: f.submittedAt,
          }))
      : [];

  const bulkDeals =
    bulkResult.status === "fulfilled"
      ? bulkResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const blockDeals =
    blockResult.status === "fulfilled"
      ? blockResult.value.deals.filter((d) => d.symbol === sym)
      : [];
  const shortDeals =
    shortResult.status === "fulfilled"
      ? shortResult.value.deals.filter((d) => d.symbol === sym)
      : [];

  const allDeals = [...bulkDeals, ...blockDeals, ...shortDeals]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)
    .map((d) => ({
      id: d.id,
      type: d.type,
      date: d.date,
      client: d.client,
      side: d.side,
      quantity: d.quantity,
      price: d.price,
      valueCr: d.valueCr,
    }));

  const now = new Date().toISOString();

  return NextResponse.json({
    symbol: sym,
    news: { items: newsItems, fetchedAt: now },
    filings: { items: filings, fetchedAt: now },
    deals: { items: allDeals, fetchedAt: now },
  });
}
