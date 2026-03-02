// lib/nse-flows.ts

const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
};

export interface FiiDiiEntry {
  date: string; // "YYYY-MM-DD"

  // Equity segment
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;

  // Debt segment
  fiiDebtBuy: number;
  fiiDebtSell: number;
  fiiDebtNet: number;
  diiDebtBuy: number;
  diiDebtSell: number;
  diiDebtNet: number;

  // Derived — computed after sorting ascending
  cumulativeFiiEquityNet: number;
  cumulativeDiiEquityNet: number;
  rollingAvg20FiiEquity: number;
  rollingAvg20DiiEquity: number;
}

export interface FlowsSnapshot {
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
  fiiDebtBuy: number;
  fiiDebtSell: number;
  fiiDebtNet: number;
  diiDebtBuy: number;
  diiDebtSell: number;
  diiDebtNet: number;
}

export interface NiftyDayClose {
  date: string; // "YYYY-MM-DD"
  close: number;
}

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "01-Jan-2025" → "2025-01-01" */
function parseNseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const month = MONTH_MAP[m[2]];
    if (month) return `${m[3]}-${month}-${m[1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  return "";
}

/** "2025-01-01" → "01-Jan-2025" for NSE API params */
function toNseParam(iso: string): string {
  const [y, m, d] = iso.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d}-${monthNames[parseInt(m) - 1]}-${y}`;
}

function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  return parseFloat(String(v).replace(/,/g, "")) || 0;
}

interface NseSnapshotItem {
  category?: string;
  buyValue?: string | number;
  sellValue?: string | number;
  netValue?: string | number;
  type?: string;
}

export async function fetchTodaySnapshot(): Promise<FlowsSnapshot | null> {
  try {
    const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: NSE_HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const items: NseSnapshotItem[] = Array.isArray(json) ? (json as NseSnapshotItem[]) : [];

    const snap: FlowsSnapshot = {
      fiiEquityBuy: 0, fiiEquitySell: 0, fiiEquityNet: 0,
      diiEquityBuy: 0, diiEquitySell: 0, diiEquityNet: 0,
      fiiDebtBuy: 0,   fiiDebtSell: 0,   fiiDebtNet: 0,
      diiDebtBuy: 0,   diiDebtSell: 0,   diiDebtNet: 0,
    };

    for (const item of items) {
      const isFii = /fii|fpi/i.test(item.category ?? "");
      const isDii = /dii/i.test(item.category ?? "");
      const isEquity = /equity/i.test(item.type ?? "");
      const isDebt = /debt/i.test(item.type ?? "");

      if (isFii && isEquity) {
        snap.fiiEquityBuy = num(item.buyValue);
        snap.fiiEquitySell = num(item.sellValue);
        snap.fiiEquityNet = num(item.netValue);
      } else if (isDii && isEquity) {
        snap.diiEquityBuy = num(item.buyValue);
        snap.diiEquitySell = num(item.sellValue);
        snap.diiEquityNet = num(item.netValue);
      } else if (isFii && isDebt) {
        snap.fiiDebtBuy = num(item.buyValue);
        snap.fiiDebtSell = num(item.sellValue);
        snap.fiiDebtNet = num(item.netValue);
      } else if (isDii && isDebt) {
        snap.diiDebtBuy = num(item.buyValue);
        snap.diiDebtSell = num(item.sellValue);
        snap.diiDebtNet = num(item.netValue);
      }
    }
    return snap;
  } catch {
    return null;
  }
}

interface NseHistoricalItem {
  date?: string;
  fiiBuyEquity?: string | number;
  fiiSellEquity?: string | number;
  fiiNetEquity?: string | number;
  diiBuyEquity?: string | number;
  diiSellEquity?: string | number;
  diiNetEquity?: string | number;
  fiiBuyDebt?: string | number;
  fiiSellDebt?: string | number;
  fiiNetDebt?: string | number;
  diiBuyDebt?: string | number;
  diiSellDebt?: string | number;
  diiNetDebt?: string | number;
  [key: string]: unknown;
}

type RawEntry = Omit<FiiDiiEntry, "cumulativeFiiEquityNet" | "cumulativeDiiEquityNet" | "rollingAvg20FiiEquity" | "rollingAvg20DiiEquity">;

export async function fetchHistoricalFlows(
  fromIso: string,
  toIso: string
): Promise<RawEntry[]> {
  const from = toNseParam(fromIso);
  const to = toNseParam(toIso);
  const url = `https://www.nseindia.com/api/historicaldata-fiiDii?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const res = await fetch(url, {
    headers: NSE_HEADERS,
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`NSE historicaldata-fiiDii returned ${res.status}`);

  const json: unknown = await res.json();
  const raw = Array.isArray(json) ? json : ((json as Record<string, unknown>)?.data ?? []);
  const items: NseHistoricalItem[] = Array.isArray(raw) ? (raw as NseHistoricalItem[]) : [];

  return items
    .map((item): RawEntry | null => {
      const date = parseNseDate(String(item.date ?? ""));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        date,
        fiiEquityBuy:  num(item.fiiBuyEquity),
        fiiEquitySell: num(item.fiiSellEquity),
        fiiEquityNet:  num(item.fiiNetEquity),
        diiEquityBuy:  num(item.diiBuyEquity),
        diiEquitySell: num(item.diiSellEquity),
        diiEquityNet:  num(item.diiNetEquity),
        fiiDebtBuy:    num(item.fiiBuyDebt),
        fiiDebtSell:   num(item.fiiSellDebt),
        fiiDebtNet:    num(item.fiiNetDebt),
        diiDebtBuy:    num(item.diiBuyDebt),
        diiDebtSell:   num(item.diiSellDebt),
        diiDebtNet:    num(item.diiNetDebt),
      };
    })
    .filter((e): e is RawEntry => e !== null);
}

function computeDerived(entries: RawEntry[]): FiiDiiEntry[] {
  let cumFii = 0;
  let cumDii = 0;

  return entries.map((e, i) => {
    cumFii += e.fiiEquityNet;
    cumDii += e.diiEquityNet;

    const windowStart = Math.max(0, i - 19);
    const win = entries.slice(windowStart, i + 1);
    const avgFii = win.reduce((s, x) => s + x.fiiEquityNet, 0) / win.length;
    const avgDii = win.reduce((s, x) => s + x.diiEquityNet, 0) / win.length;

    return {
      ...e,
      cumulativeFiiEquityNet: cumFii,
      cumulativeDiiEquityNet: cumDii,
      rollingAvg20FiiEquity: avgFii,
      rollingAvg20DiiEquity: avgDii,
    };
  });
}

export async function fetchNiftyDailyHistory(): Promise<NiftyDayClose[]> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1y";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    return timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close: closes[i] ?? 0,
      }))
      .filter((d) => d.close > 0);
  } catch {
    return [];
  }
}

export async function fetchAllFlowData(): Promise<{
  entries: FiiDiiEntry[];
  snapshot: FlowsSnapshot | null;
  nifty: NiftyDayClose[];
}> {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);

  const fromIso = fromDate.toISOString().slice(0, 10);
  const toIso = toDate.toISOString().slice(0, 10);

  const [rawEntries, snapshot, nifty] = await Promise.allSettled([
    fetchHistoricalFlows(fromIso, toIso),
    fetchTodaySnapshot(),
    fetchNiftyDailyHistory(),
  ]);

  const historical = rawEntries.status === "fulfilled" ? rawEntries.value : [];
  historical.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const entries = computeDerived(historical);

  return {
    entries,
    snapshot: snapshot.status === "fulfilled" ? snapshot.value : null,
    nifty: nifty.status === "fulfilled" ? nifty.value : [],
  };
}
