/**
 * lib/bse-sectors.ts
 *
 * Fetches BSE SENSEX sector index data from api.bseindia.com.
 * Covers both cat=2 (Sector & Industry) and cat=3 (Thematics) to get
 * all 24 sectors used in the EOD Snippets report template.
 *
 * Note: BSE sends malformed HTTP headers (leading whitespace in
 * Strict-Transport-Security). We use node:https with insecureHTTPParser.
 */

import https from "node:https";
import zlib from "node:zlib";

// -- Types ----------------------------------------------------------------------

export interface BseSectorQuote {
  code: string;          // BSE index code, e.g. "BSECG"
  name: string;          // Full BSE name, e.g. "BSE CAPITAL GOODS"
  label: string;         // Short display label, e.g. "Capital Goods"
  price: number;         // Current value
  prevClose: number;
  change: number;        // Points change
  changePercent: number; // % change (ChgPer)
  high: number;
  low: number;
  mktcapPerc: number;    // Market-cap weight in BSE (%)
  fetchedAt: string;
}

interface BseRawItem {
  INDX_CD: string;
  IndexName: string;
  Curvalue: number;
  Prev_Close: number;
  Chg: number;
  ChgPer: number;
  High: number;
  Low: number;
  MktcapPerc?: number;
}

// -- EOD template sector grid ---------------------------------------------------
//
// 24 sectors displayed as 6 rows x 4 paired (Index | %) columns. Order and
// exact codes verified cell-by-cell against a real Sunidhi-authored EOD
// report (2026-07-15) and BSE's live cat=2/cat=3 index list -- NOT a guess.
//
// Row 18 -> indices 0-3  | Row 19 -> 4-7  | Row 20 -> 8-11
// Row 21 -> indices 12-15 | Row 22 -> 16-19 | Row 23 -> 20-23

export const EOD_SENSEX_SECTORS: ReadonlyArray<{ label: string; code: string }> = [
  // Row 18
  { label: "Capital Goods",           code: "BSECG"   }, // cat=2
  { label: "Bankex",                  code: "BANKEX"  }, // cat=2
  { label: "Commodities",             code: "COMDTY"  }, // cat=2
  { label: "Infrastructure",          code: "INFRA"   }, // cat=3
  // Row 19
  { label: "Consumer Durables",       code: "BSECD"   }, // cat=2
  { label: "Energy",                  code: "ENERGY"  }, // cat=2
  { label: "Services",                code: "BSESER"  }, // cat=2
  { label: "Focused IT",              code: "FOCIT"   }, // cat=2
  // Row 20
  { label: "Financial Services",      code: "FINSER"  }, // cat=2
  { label: "Auto",                    code: "AUTO"    }, // cat=2
  { label: "Utilities",               code: "UTILS"   }, // cat=2
  { label: "Realty",                  code: "REALTY"  }, // cat=2
  // Row 21
  { label: "Consumer Discretionary",  code: "CONDIS"  }, // cat=2
  { label: "PSU",                     code: "BSEPSU"  }, // cat=3
  { label: "Metal",                   code: "METAL"   }, // cat=2
  { label: "FMCG",                    code: "BSEFMCG" }, // cat=2
  // Row 22
  { label: "Oil & Gas",               code: "OILGAS"  }, // cat=2
  { label: "Telecom",                 code: "TELCOM"  }, // cat=2
  { label: "TECK",                    code: "TECK"    }, // cat=3
  { label: "POWER & ENERGY",          code: "POWENE"  }, // cat=3
  // Row 23
  { label: "Healthcare",              code: "BSEHC"   }, // cat=2
  { label: "Power",                   code: "POWER"   }, // cat=2
  { label: "IT",                      code: "BSEIT"   }, // cat=2
  { label: "Manufacturing",           code: "MFG"     }, // cat=3
];

// -- BSE HTTP fetch (insecureHTTPParser for malformed headers) -----------------

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function bseFetch(url: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => req.destroy(new Error(`BSE sectors timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, */*",
          "Accept-Encoding": "gzip, deflate",
          "Referer":         "https://www.bseindia.com/sensex/indexhighlight",
        },
        insecureHTTPParser: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        const encoding = res.headers["content-encoding"] ?? "";

        const sink = encoding.includes("gzip")
          ? res.pipe(zlib.createGunzip())
          : encoding.includes("deflate")
          ? res.pipe(zlib.createInflate())
          : res;

        sink.on("data", (c: Buffer) => chunks.push(c));
        sink.on("end", () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        sink.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
      },
    );

    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// -- Core fetch ----------------------------------------------------------------

async function fetchCategory(cat: 2 | 3): Promise<BseRawItem[]> {
  const url = `https://api.bseindia.com/BseIndiaAPI/api/MktCapBoard_indstream/w?type=2&cat=${cat}`;
  const body = await bseFetch(url);
  const json = JSON.parse(body) as { RealTime?: BseRawItem[] };
  return json.RealTime ?? [];
}

/**
 * Fetch all BSE sector indices (cat=2 + cat=3).
 * Returns every index found, labelled with the short display name where we have
 * a mapping in EOD_SENSEX_SECTORS.
 */
export async function fetchBseSectors(): Promise<BseSectorQuote[]> {
  const [r2, r3] = await Promise.allSettled([fetchCategory(2), fetchCategory(3)]);

  const raw: BseRawItem[] = [
    ...(r2.status === "fulfilled" ? r2.value : []),
    ...(r3.status === "fulfilled" ? r3.value : []),
  ];

  const fetchedAt = new Date().toISOString();

  return raw.map((item): BseSectorQuote => {
    const code = item.INDX_CD.trim();
    const mapped = EOD_SENSEX_SECTORS.find((s) => s.code === code);
    return {
      code,
      name: item.IndexName,
      label: mapped?.label ?? item.IndexName.replace(/^BSE\s+/i, "").trim(),
      price:         item.Curvalue,
      prevClose:     item.Prev_Close,
      change:        item.Chg,
      changePercent: item.ChgPer,
      high:          item.High,
      low:           item.Low,
      mktcapPerc:    item.MktcapPerc ?? 0,
      fetchedAt,
    };
  });
}

/**
 * Returns exactly the 24 EOD template sectors in row-by-row order.
 * Each element is either the fetched quote or null if the BSE API didn't return it.
 */
export function mapEodSectors(
  sectors: BseSectorQuote[],
): Array<BseSectorQuote | null> {
  const byCode = new Map(sectors.map((s) => [s.code, s]));
  return EOD_SENSEX_SECTORS.map(({ code }) => byCode.get(code) ?? null);
}
