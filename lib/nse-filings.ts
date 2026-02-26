import Parser from "rss-parser";
import type { FilingCategory } from "./bse-filings";

// Re-export so consumers can import FilingCategory from either lib
export type { FilingCategory };

export interface NSEFiling {
  id: string;
  company: string;
  scripCode: string;       // NSE trading symbol (parsed from title)
  filingType: string;
  category: FilingCategory;
  description: string;
  pdfUrl: string | null;   // Direct NSE filing link — always populated
  submittedAt: string;
}

// rss-parser instance with NSE custom fields
// (mirrors sunidhi-nextjs/src/app/api/nse-feeds/route.ts reference implementation)
const parser = new Parser({
  customFields: {
    item: [["pdf_link", "pdfLink"]],
  },
});

type NSEFeedKey =
  | "financialResults"
  | "boardMeetings"
  | "insiderTrading"
  | "offerDocuments"
  | "announcements"
  | "corporateAction";

const NSE_FEEDS: Record<NSEFeedKey, string> = {
  financialResults: "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml",
  boardMeetings:    "https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml",
  insiderTrading:   "https://nsearchives.nseindia.com/content/RSS/Insider_Trading.xml",
  offerDocuments:   "https://nsearchives.nseindia.com/content/RSS/Offer_Documents.xml",
  announcements:    "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml",
  corporateAction:  "https://nsearchives.nseindia.com/content/RSS/Corporate_action.xml",
};

const FEED_CATEGORY: Record<NSEFeedKey, FilingCategory> = {
  financialResults: "results",
  boardMeetings:    "board-meeting",
  insiderTrading:   "insider-trade",
  offerDocuments:   "ipo-drhp",
  announcements:    "general",
  corporateAction:  "general",
};

const FEED_LABEL: Record<NSEFeedKey, string> = {
  financialResults: "Financial Results",
  boardMeetings:    "Board Meeting",
  insiderTrading:   "Insider Trading",
  offerDocuments:   "Offer Document",
  announcements:    "Announcement",
  corporateAction:  "Corporate Action",
};

/**
 * NSE RSS titles use the format: "SYMBOL : Description of filing"
 * e.g. "INFY : Standalone Q3 FY25 Financial Results"
 *      "RELIANCE : Outcome of Board Meeting held on 14-Feb-2026"
 * Fall back gracefully when the separator is absent.
 */
function parseNSETitle(raw: string): { symbol: string; description: string } {
  const sep = raw.indexOf(" : ");
  if (sep !== -1) {
    return {
      symbol:      raw.slice(0, sep).trim(),
      description: raw.slice(sep + 3).trim(),
    };
  }
  return { symbol: "", description: raw.trim() };
}

/**
 * Fetch the 6 key NSE RSS feeds in parallel and return a merged,
 * date-sorted array of NSEFiling objects.
 *
 * Each item's `link` field is a direct NSE filing page URL — pdfUrl is
 * always populated, solving the core "useless" problem with the BSE feed.
 */
export async function fetchNSEFilings(limit = 50): Promise<NSEFiling[]> {
  const feedEntries = Object.entries(NSE_FEEDS) as [NSEFeedKey, string][];
  // Request slightly more per feed to ensure we have enough after dedup/sort
  const perFeed = Math.ceil(limit / feedEntries.length) + 2;

  const results = await Promise.allSettled(
    feedEntries.map(async ([key, url]) => {
      const feed = await parser.parseURL(url);
      return feed.items.slice(0, perFeed).map((item, i): NSEFiling => {
        const rawTitle = item.title ?? "Untitled";
        const { symbol, description } = parseNSETitle(rawTitle);
        // Prefer item.link (always the NSE filing page URL); fall back to pdfLink custom field
        const link: string | null =
          item.link ?? (item as Record<string, unknown>).pdfLink as string ?? null;

        return {
          id: `nse-${key}-${i}-${item.isoDate ?? Date.now()}`,
          company: symbol || rawTitle,
          scripCode: symbol,
          filingType: FEED_LABEL[key],
          category: FEED_CATEGORY[key],
          description,
          pdfUrl: link,
          submittedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
        };
      });
    })
  );

  const filings: NSEFiling[] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      filings.push(...result.value);
    } else {
      console.error(`[nse-filings] Feed fetch failed [${feedEntries[i][0]}]:`, result.reason);
    }
  }

  // Sort newest first, then cap to limit
  filings.sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  return filings.slice(0, limit);
}
