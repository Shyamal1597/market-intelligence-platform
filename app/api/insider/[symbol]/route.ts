import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HTML_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

const JSON_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "X-Requested-With": "XMLHttpRequest",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export interface InsiderDisclosure {
  name: string;
  category: string;
  sharesTransacted: number;
  transactionType: "Buy" | "Sell" | "Pledge" | "Other";
  beforePct: number;
  afterPct: number;
  date: string;
}

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const arr: string[] = h.getSetCookie
    ? h.getSetCookie()
    : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/);
  return arr.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function getNseInsiderSession(): Promise<string> {
  const r1 = await fetch(
    "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
    { headers: HTML_HEADERS }
  );
  return extractCookies(r1);
}

function parseTransactionType(raw: string | undefined): InsiderDisclosure["transactionType"] {
  if (!raw) return "Other";
  const u = raw.toLowerCase().trim();
  if (u === "buy" || u === "b") return "Buy";
  if (u === "sell" || u === "s") return "Sell";
  if (u.includes("pledge")) return "Pledge";
  return "Other";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const cookies = await getNseInsiderSession();

    // Date range: last 90 days
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 90);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    const url = `https://www.nseindia.com/api/corporates-pit?index=equities&symbol=${encodeURIComponent(symbol.toUpperCase())}&from_date=${fmt(from)}&to_date=${fmt(to)}`;

    const res = await fetch(url, {
      headers: {
        ...JSON_HEADERS,
        Cookie: cookies,
        Referer: "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ disclosures: [] });
    }

    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      return NextResponse.json({ disclosures: [] });
    }

    const json = JSON.parse(text);
    const raw: Record<string, string | number>[] = json.data ?? [];

    const disclosures: InsiderDisclosure[] = raw.slice(0, 5).map((r) => ({
      name: String(r.acqName ?? ""),
      category: String(r.personCategory ?? ""),
      sharesTransacted: Number(r.secAcquired ?? 0),
      transactionType: parseTransactionType(String(r.buyOrSell ?? "")),
      beforePct: Number(r.befAcqSharesPer ?? 0),
      afterPct: Number(r.afterAcqSharesPer ?? 0),
      date: String(r.date ?? ""),
    }));

    return NextResponse.json({ disclosures });
  } catch {
    return NextResponse.json({ disclosures: [] });
  }
}
