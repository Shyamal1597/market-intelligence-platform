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
// rss-parser with NSE custom fields
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
  | "corporateAction"
  | "annualReports"
  | "investorComplaints";

const NSE_FEEDS: Record<NSEFeedKey, string> = {
  financialResults:   "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml",
  boardMeetings:      "https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml",
  insiderTrading:     "https://nsearchives.nseindia.com/content/RSS/Insider_Trading.xml",
  offerDocuments:     "https://nsearchives.nseindia.com/content/RSS/Offer_Documents.xml",
  announcements:      "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml",
  corporateAction:    "https://nsearchives.nseindia.com/content/RSS/Corporate_action.xml",
  annualReports:      "https://nsearchives.nseindia.com/content/RSS/Annual_Report.xml",
  investorComplaints: "https://nsearchives.nseindia.com/content/RSS/Investor_Complaints.xml",
};

const FEED_CATEGORY: Record<NSEFeedKey, FilingCategory> = {
  financialResults:   "results",
  boardMeetings:      "board-meeting",
  insiderTrading:     "insider-trade",
  offerDocuments:     "ipo-drhp",
  announcements:      "general",
  corporateAction:    "corporate-action",
  annualReports:      "annual-report",
  investorComplaints: "investor-complaint",
};

const FEED_LABEL: Record<NSEFeedKey, string> = {
  financialResults:   "Financial Results",
  boardMeetings:      "Board Meeting",
  insiderTrading:     "Insider Trading",
  offerDocuments:     "Offer Document",
  announcements:      "Announcement",
  corporateAction:    "Corporate Action",
  annualReports:      "Annual Report",
  investorComplaints: "Investor Complaint",
};

/**
 * NSE RSS title is now just the company name (e.g. "State Bank Of India").
 * The actual subject/description lives in the RSS <description> field.
 * We keep the old "SYMBOL : Description" parsing for backward compat in
 * case any feed still uses that format.
 */
function parseNSETitle(raw: string): { symbol: string; description: string } {
  const sep = raw.indexOf(" : ");
  if (sep !== -1) {
    return {
      symbol:      raw.slice(0, sep).trim(),
      description: raw.slice(sep + 3).trim(),
    };
  }
  // New format: title is the company name only — symbol is unknown from title alone
  return { symbol: "", description: raw.trim() };
}

/**
 * Extract a concise subject from the RSS <description> field.
 * NSE descriptions look like:
 *   "Company Name has informed the Exchange regarding ... |SUBJECT: Board Meeting"
 * We extract the SUBJECT text; fall back to the full snippet (≤180 chars).
 */
function extractFilingSubject(content: string | undefined): string {
  if (!content) return "";
  const subjectMatch = content.match(/\|SUBJECT:\s*(.+)/i);
  if (subjectMatch) return subjectMatch[1].trim();
  // Strip the leading "Company has informed..." boilerplate if no SUBJECT tag
  const stripped = content.replace(/^.+?has informed the exchange[^|]*/i, "").trim();
  return stripped.slice(0, 180) || content.slice(0, 180);
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
        const { symbol: parsedSymbol } = parseNSETitle(rawTitle);
        // link: prefer item.link (NSE filing page); fall back to pdfLink custom field
        const link: string | null =
          item.link ?? ((item as unknown as Record<string, unknown>).pdfLink as string) ?? null;

        // Company name: either the symbol part of old "SYMBOL : Desc" format, or the full title
        const companyName = parsedSymbol || rawTitle;

        // scripCode: if the title had the old SYMBOL format use that;
        // otherwise use the company name — the portfolio matching layer does
        // alias lookup against this field.
        const scripCode = parsedSymbol || rawTitle;

        // Description: prefer the RSS <description> SUBJECT tag; fall back to
        // the old title-parsed description for feeds still using "SYMBOL : Desc".
        const rssContent = item.contentSnippet ?? item.content ?? "";
        const description = extractFilingSubject(rssContent) || (parsedSymbol ? rawTitle.slice(parsedSymbol.length + 3) : rawTitle);

        return {
          id: `nse-${key}-${i}-${item.isoDate ?? Date.now()}`,
          company: companyName,
          scripCode,
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
