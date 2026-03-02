// lib/bse-calendar.ts
import * as cheerio from "cheerio";

export interface EarningsEntry {
  company: string;
  bseCode: string;
  date: string;       // ISO date string "YYYY-MM-DD"
  purpose: string;    // raw purpose text from BSE
  category: "Results" | "Dividend" | "Bonus" | "Other";
}

const BSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.bseindia.com/",
};

/** Normalise BSE date strings to ISO YYYY-MM-DD */
function parseBseDate(raw: string): string {
  const trimmed = raw.trim();

  // ISO format with time component: "2026-02-28T00:00:00" or "2026-02-28"
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const parts = trimmed.split(/[\/\-]/);
  if (parts.length === 3) {
    const [first, second, third] = parts;
    // Disambiguate: if first part length is 4 it's YYYY-MM-DD already handled above
    // Here first is DD, second is MM, third is YYYY
    if (third.length === 4) {
      const dd = first.padStart(2, "0");
      const mm = second.padStart(2, "0");
      return `${third}-${mm}-${dd}`;
    }
  }

  // Fallback: attempt native Date parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return trimmed;
}

/** Format a Date object as DD%2FMM%2FYYYY for BSE URL params */
function formatBseUrlDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}%2F${mm}%2F${yyyy}`;
}

function inferCategory(
  purpose: string
): "Results" | "Dividend" | "Bonus" | "Other" {
  const lower = purpose.toLowerCase();
  if (lower.includes("result") || lower.includes("financial")) return "Results";
  if (lower.includes("dividend")) return "Dividend";
  if (lower.includes("bonus")) return "Bonus";
  return "Other";
}

/** Deduplicate entries by (bseCode, date, category) */
function deduplicate(entries: EarningsEntry[]): EarningsEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.bseCode}|${e.date}|${e.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Attempt primary BSE JSON API */
async function fetchPrimary(
  startDate: Date,
  endDate: Date
): Promise<EarningsEntry[]> {
  const strdate = formatBseUrlDate(startDate);
  const enddate = formatBseUrlDate(endDate);
  const url = `https://api.bseindia.com/BseIndiaAPI/api/BoardMeetings/w?strdate=${strdate}&enddate=${enddate}&ddlcategorys=&scripcode=`;

  const res = await fetch(url, {
    headers: BSE_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`BSE primary API returned ${res.status}`);
  }

  // BSE sometimes returns non-JSON on bot detection — guard against it
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("BSE primary API did not return valid JSON");
  }

  // BSE returns { Table: [...] } or { Table1: [...] } or nested object
  const root = json as Record<string, unknown>;
  const table: unknown[] =
    (Array.isArray(root.Table) ? root.Table : null) ??
    (Array.isArray(root.Table1) ? root.Table1 : null) ??
    [];

  return table.map((item) => {
    const row = item as Record<string, unknown>;

    const bseCode = String(
      row.SCRIP_CD ?? row.scripcd ?? row.ScripCode ?? ""
    ).trim();

    const company = String(
      row.COMP_NAME ?? row.company_name ?? row.CompanyName ?? row.COMPANYNAME ?? "Unknown"
    ).trim();

    const rawDate = String(
      row.DT_TM ?? row.meeting_date ?? row.MEETING_DATE ?? row.MeetingDate ?? ""
    ).trim();

    const purpose = String(
      row.PURPOSE ?? row.purpose ?? row.PURPOSEOFMEETING ?? row.PurposeOfMeeting ?? ""
    ).trim();

    return {
      company,
      bseCode,
      date: parseBseDate(rawDate),
      purpose,
      category: inferCategory(purpose),
    };
  }).filter((e) => e.bseCode !== "" && e.date !== "");
}

/** Fallback: cheerio scrape of the BSE board meetings HTML page */
async function fetchFallback(): Promise<EarningsEntry[]> {
  const url = "https://www.bseindia.com/corporates/Board_Meetings.html";

  const res = await fetch(url, {
    headers: BSE_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`BSE fallback HTML returned ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const entries: EarningsEntry[] = [];

  // The board meetings page renders a table — rows contain: company, code, date, purpose
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const company = $(cells[0]).text().trim();
    const bseCode = $(cells[1]).text().trim();
    const rawDate = $(cells[2]).text().trim();
    const purpose = $(cells[3]).text().trim();

    if (!company || !bseCode || !rawDate) return;

    entries.push({
      company,
      bseCode,
      date: parseBseDate(rawDate),
      purpose,
      category: inferCategory(purpose),
    });
  });

  return entries.filter((e) => /^\d{6}$/.test(e.bseCode));
}

/** Fetch board meetings for today → today + 30 days. Returns entries sorted by date ascending. */
export async function fetchBoardMeetings(): Promise<EarningsEntry[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 30);

  let entries: EarningsEntry[] = [];

  try {
    entries = await fetchPrimary(today, endDate);
  } catch (primaryErr) {
    console.error("BSE calendar primary API failed:", primaryErr);

    try {
      entries = await fetchFallback();
    } catch (fallbackErr) {
      console.error("BSE calendar fallback scrape failed:", fallbackErr);
      return [];
    }
  }

  const deduped = deduplicate(entries);

  deduped.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return deduped;
}
