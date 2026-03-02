// lib/bse-calendar.ts
// Uses NSE event-calendar API — returns upcoming board meetings for ~30 days

export interface EarningsEntry {
  company: string;
  bseCode: string;   // populated with NSE symbol (e.g. "RELIANCE")
  date: string;      // ISO date string "YYYY-MM-DD"
  purpose: string;   // raw purpose text
  category: "Results" | "Dividend" | "Bonus" | "Other";
}

const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
};

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Parse NSE date "03-Mar-2026" → "2026-03-03" */
function parseNseDate(raw: string): string {
  const trimmed = raw.trim();

  // NSE format: "03-Mar-2026"
  const nseMatch = trimmed.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (nseMatch) {
    const month = MONTH_MAP[nseMatch[2]];
    if (month) return `${nseMatch[3]}-${month}-${nseMatch[1]}`;
  }

  // ISO with optional time: "2026-03-03T..."
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  return "";
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

function deduplicate(entries: EarningsEntry[]): EarningsEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.bseCode}|${e.date}|${e.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface NseEventItem {
  symbol?: string;
  company?: string;
  purpose?: string;
  bm_desc?: string;
  date?: string;
}

/** Fetch from NSE event-calendar API */
async function fetchNseCalendar(): Promise<EarningsEntry[]> {
  const res = await fetch("https://www.nseindia.com/api/event-calendar", {
    headers: NSE_HEADERS,
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`NSE event-calendar returned ${res.status}`);

  const json: unknown = await res.json();
  const items: NseEventItem[] = Array.isArray(json) ? json : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  return items
    .map((item) => {
      const date = parseNseDate(item.date ?? "");
      const purpose = (item.purpose ?? item.bm_desc ?? "").trim();
      return {
        company: (item.company ?? "").trim(),
        bseCode: (item.symbol ?? "").trim(),
        date,
        purpose,
        category: inferCategory(purpose),
      };
    })
    .filter((e) => {
      if (!e.company || !e.bseCode || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
      const d = new Date(e.date);
      return d >= today && d <= cutoff;
    });
}

/** Fetch board meetings for today → today + 30 days. Returns entries sorted ascending. */
export async function fetchBoardMeetings(): Promise<EarningsEntry[]> {
  try {
    const entries = await fetchNseCalendar();
    const deduped = deduplicate(entries);
    deduped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return deduped;
  } catch (err) {
    console.error("NSE event-calendar failed:", err);
    return [];
  }
}
