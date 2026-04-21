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

// NSE RSS feed titles are now just the company name ("State Bank Of India").
// scripCode and company both hold the company name after the recent NSE format change.
// Match the NSE ticker OR any known long-form alias against both fields.
function matchesFiling(scripCode: string, company: string, sym: string): boolean {
  const fields = [scripCode.toUpperCase().trim(), company.toUpperCase().trim()];

  for (const f of fields) {
    if (!f) continue;
    if (f === sym) return true;                    // exact ticker ("SBIN")
    // Strip common series suffixes like "-EQ", "-BE"
    if (f.replace(/-[A-Z0-9]+$/, "").trim() === sym) return true;
  }

  const aliases = SYMBOL_ALIASES[sym] ?? [];
  return aliases.some((alias) => {
    const a = alias.toUpperCase();
    return fields.some((f) => {
      if (!f) return false;
      if (a.length >= 6) return f.includes(a);    // long alias: substring OK
      return f === a;                              // short alias: exact only
    });
  });
}

/**
 * Word-boundary-aware match: the term must appear as a whole word in the title.
 * Prevents "RIL" matching "APRIL" (A-P-R-I-L), "SBI" matching "NSBI", etc.
 * A "word boundary" here means the character immediately before/after the term
 * is not an uppercase letter or digit.
 */
function titleContainsTerm(title: string, term: string): boolean {
  let start = 0;
  while (true) {
    const idx = title.indexOf(term, start);
    if (idx === -1) return false;
    const before = idx > 0 ? title[idx - 1] : " ";
    const after  = idx + term.length < title.length ? title[idx + term.length] : " ";
    if (!/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after)) return true;
    start = idx + 1;
  }
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
      // Title-only, whole-word match — prevents "RIL" ⊂ "APRIL", "LT" ⊂ "RESULT", etc.
      return terms.some((t) => titleContainsTerm(title, t));
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
      fetchNSEFilings(2000), // ~333 per feed — covers a full day of NSE filings
      fetchBulkDeals(),
      fetchBlockDeals(),
      fetchShortDeals(),
    ]);

  const newsItems = getPortfolioNews(sym, 15);

  const filings =
    filingsResult.status === "fulfilled"
      ? filingsResult.value
          // Match on ticker OR full company name via aliases (NSE RSS now uses company names)
          .filter((f) => matchesFiling(f.scripCode, f.company, sym))
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
