import { XMLParser } from "fast-xml-parser";

export interface BSEFiling {
  id: string;
  company: string;
  scripCode: string;
  filingType: string;
  category: FilingCategory;
  description: string;
  pdfUrl: string | null;
  submittedAt: string;
}

export type FilingCategory =
  | "results"
  | "board-meeting"
  | "insider-trade"
  | "ipo-drhp"
  | "general";

function classifyFiling(filingType: string): FilingCategory {
  const t = filingType.toLowerCase();
  if (t.includes("result") || t.includes("financial")) return "results";
  if (t.includes("board") || t.includes("meeting")) return "board-meeting";
  if (
    t.includes("insider") ||
    t.includes("promoter") ||
    t.includes("shareholding")
  )
    return "insider-trade";
  if (t.includes("drhp") || t.includes("prospectus") || t.includes("ipo"))
    return "ipo-drhp";
  return "general";
}

export async function fetchBSEFilings(limit = 50): Promise<BSEFiling[]> {
  try {
    // BSE public announcements XML feed
    const url =
      "https://www.bseindia.com/xml-data/corpfiling/AcceptedXML/GetCorpFiling.aspx";

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/xml, text/xml, */*",
        Referer: "https://www.bseindia.com/",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`BSE fetch failed: ${res.status}`);
      return getMockFilings(); // fallback to mock data if BSE is unreachable
    }

    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const items =
      parsed?.NewDataSet?.Table ?? parsed?.root?.item ?? [];
    const arr = Array.isArray(items) ? items : [items];

    return arr.slice(0, limit).map((item: Record<string, unknown>, i: number) => {
      const filingType = String(item.CATEGORYNAME ?? item.Category ?? "Announcement");
      return {
        id: `${item.SCRIPCD ?? i}-${Date.now()}-${i}`,
        company: String(item.COMPANYNAME ?? item.Company ?? "Unknown Company"),
        scripCode: String(item.SCRIPCD ?? ""),
        filingType,
        category: classifyFiling(filingType),
        description: String(item.HEADLINE ?? item.Headline ?? filingType),
        pdfUrl: item.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`
          : null,
        submittedAt: String(item.SLONGDATE ?? item.DATE_OF_FILING ?? new Date().toISOString()),
      };
    });
  } catch (err) {
    console.error("BSE filings error:", err);
    return getMockFilings();
  }
}

// Fallback mock data for when BSE is unreachable (dev/network issues)
function getMockFilings(): BSEFiling[] {
  const now = new Date();
  return [
    {
      id: "mock-1",
      company: "Reliance Industries Ltd",
      scripCode: "500325",
      filingType: "Board Meeting",
      category: "board-meeting",
      description: "Outcome of Board Meeting - Q3 FY2026 Results",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 5 * 60000).toISOString(),
    },
    {
      id: "mock-2",
      company: "HDFC Bank Ltd",
      scripCode: "500180",
      filingType: "Financial Results",
      category: "results",
      description: "Unaudited Financial Results for Q3 FY2026",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 15 * 60000).toISOString(),
    },
    {
      id: "mock-3",
      company: "Infosys Ltd",
      scripCode: "500209",
      filingType: "Insider Trading",
      category: "insider-trade",
      description: "Disclosure under SEBI (PIT) Regulations - Promoter Trade",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 32 * 60000).toISOString(),
    },
    {
      id: "mock-4",
      company: "Tata Consultancy Services",
      scripCode: "532540",
      filingType: "Announcement",
      category: "general",
      description: "Investor Presentation - Q3 FY2026",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 48 * 60000).toISOString(),
    },
    {
      id: "mock-5",
      company: "Zomato Ltd",
      scripCode: "543320",
      filingType: "Prospectus",
      category: "ipo-drhp",
      description: "Draft Red Herring Prospectus filed with SEBI",
      pdfUrl: null,
      submittedAt: new Date(now.getTime() - 65 * 60000).toISOString(),
    },
  ];
}
