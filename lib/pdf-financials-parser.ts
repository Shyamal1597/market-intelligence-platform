/**
 * PDF Financials Parser
 *
 * Extracts structured financial data from equity research PDF text chunks.
 * Reports contain 4 parseable table types:
 *  1. Annual P&L rows  — FY\d\d label with values (mid-line due to 2-column PDF layout)
 *  2. Quarterly table  — line containing 3+ Q[1-4]FY\d\d quarter labels
 *  3. Valuations table — "Year End-March" header with FY columns
 *  4. Balance Sheet    — interleaved on same lines as Valuations (last N numbers per line)
 *
 * Note: Some research reports use "EBIDTA" (typo) instead of "EBITDA" in places.
 */

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface AnnualRow {
  fy: string;              // "FY24", "FY25E", "FY26E"
  rev: number | null;      // Revenue (₹ mn)
  ebitda: number | null;
  ebitdaPct: number | null; // EBITDA margin %
  pat: number | null;      // Net profit / PAT
  eps: number | null;      // Adj. EPS ₹
  pe: number | null;       // P/E multiple
  evEbitda: number | null; // EV/EBITDA multiple
  roe: number | null;      // Return on equity %
  isEstimate: boolean;
}

export interface QuarterlyRow {
  quarter: string;          // "Q1FY23", "Q2FY26"
  revenues: number | null;
  ebitda: number | null;
  ebitdaPct: number | null; // EBITDA margin %
  netProfit: number | null;
}

export interface RatioTimeSeries {
  years: string[];           // ["FY24", "FY25", "FY26E", ...]
  eps: (number | null)[];
  pe: (number | null)[];
  evEbitda: (number | null)[];
  ebitdaPct: (number | null)[];
  roe: (number | null)[];
}

export interface BalanceSeries {
  years: string[];
  equity: (number | null)[];
  totalDebt: (number | null)[];
  totalAssets: (number | null)[];
}

export interface FinancialSnapshot {
  source: string;           // "IC" | "RU" | "CU" …
  parserVersion: string;    // version tag for cache-bust detection
  annual: AnnualRow[];
  quarterly: QuarterlyRow[];
  ratios: RatioTimeSeries | null;
  balanceSheet: BalanceSeries | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface Token {
  val: number;
  pct: boolean;
}

/**
 * Extract all numeric tokens from a string.
 * Handles: 77,179 | 1,13,712 | 14.0% | (2) | -22.6 | (14.4)
 */
function parseTokens(s: string): Token[] {
  const out: Token[] = [];
  const re = /\(([\d,]+(?:\.\d+)?)\)|(-?[\d,]+(?:\.\d+)?)(%?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) {
      // (1,234.5) → negative
      const v = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(v)) out.push({ val: -v, pct: false });
    } else if (m[2] !== undefined) {
      const v = parseFloat(m[2].replace(/,/g, ""));
      if (!isNaN(v)) out.push({ val: v, pct: m[3] === "%" });
    }
  }
  return out;
}

function nums(s: string): number[] {
  return parseTokens(s).map((t) => t.val);
}

/** Normalise an FY label: "FY26 E" → "FY26E", "FY26E" → "FY26E", "FY24" → "FY24" */
function normFY(base: string, estChar?: string): string {
  return estChar ? `${base}${estChar}` : base;
}

// ── Annual table ──────────────────────────────────────────────────────────────
//
// In research ICs the annual summary block on the cover page looks like:
//
//   Financials    Revenues   EBIDTA   PAT   A-EPS   P/E   EV/EBIDTA   RoAE
//   (mn)          (mn)       (mn)     (₹)   (x)     (x)   (%)
//   FY24              5,157     989    669    11.1   50.4      35.9   22.68%
//   FY26 E            8,738   1,678  1,118    17.9   31.4      21.2   23.01%
//   FY26E           1,13,712  11,097  5,329   31.0   25.2      12.5   25.6
//
// The FY label appears mid-line (lots of leading whitespace from 2-column PDF).
// Format A: Rev · EBITDA · PAT · EPS · P/E · EV/EBITDA · ROE  (no margin %)
// Format B: Rev · EBITDA · EBITDA% · PAT · [PAT%] · EPS · P/E · EV/EBITDA · [ROE%]

function parseAnnualRows(text: string): AnnualRow[] {
  const rows: AnnualRow[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Match "FY26 E" or "FY26E" or "FY24" anywhere in the line,
    // followed by 2+ spaces and a digit/(  (start of a number)
    // [ ]? allows exactly one optional space between year digits and E/P marker
    const m = line.match(/\b(FY(\d{2}))[ ]?([EP])?\s{2,}(?=[\d(])/);
    if (!m || m.index === undefined) continue;

    const fy = normFY(m[1], m[3]); // "FY26E" or "FY24"
    const isEstimate = !!m[3];

    // Take everything AFTER the FY pattern (to exclude left-column text)
    const afterFY = line.slice(m.index + m[0].length);
    const toks = parseTokens(afterFY);

    if (toks.length < 5) continue;
    if (toks[0].val < 100) continue; // Revenue should be > 100 mn

    // Format B has percentage tokens embedded in positions 2-5
    const hasMarginPcts = toks.slice(2, 5).some((t) => t.pct);

    let row: AnnualRow;
    if (hasMarginPcts) {
      // Format B: Rev · EBITDA · EBITDA% · PAT · [PAT%] · EPS · P/E · EV/EBITDA · [ROE%]
      let i = 0;
      const rev = toks[i++]?.val ?? null;
      const ebitda = toks[i++]?.val ?? null;
      const ebitdaPct = toks[i]?.pct ? (toks[i++]?.val ?? null) : null;
      const pat = toks[i++]?.val ?? null;
      if (toks[i]?.pct) i++; // skip optional PAT%
      const eps = toks[i++]?.val ?? null;
      const pe = toks[i++]?.val ?? null;
      const evEbitda = toks[i++]?.val ?? null;
      const roe = toks[i]?.val ?? null;
      row = { fy, isEstimate, rev, ebitda, ebitdaPct, pat, eps, pe, evEbitda, roe };
    } else {
      // Format A: Rev · EBITDA · PAT · EPS · P/E · EV/EBITDA · [ROE]
      row = {
        fy,
        isEstimate,
        rev: toks[0]?.val ?? null,
        ebitda: toks[1]?.val ?? null,
        ebitdaPct: null,
        pat: toks[2]?.val ?? null,
        eps: toks[3]?.val ?? null,
        pe: toks[4]?.val ?? null,
        evEbitda: toks[5]?.val ?? null,
        roe: toks[6]?.val ?? null,
      };
    }

    rows.push(row);
  }

  // Deduplicate by FY: keep row with most non-null financial fields
  const richness = (r: AnnualRow) =>
    [r.rev, r.ebitda, r.ebitdaPct, r.pat, r.eps, r.pe, r.evEbitda, r.roe].filter(
      (v) => v !== null
    ).length;

  const byFY = new Map<string, AnnualRow>();
  for (const row of rows) {
    const prev = byFY.get(row.fy);
    if (!prev || richness(row) > richness(prev)) byFY.set(row.fy, row);
  }

  return [...byFY.values()].sort((a, b) => a.fy.localeCompare(b.fy));
}

// ── Quarterly table ───────────────────────────────────────────────────────────
//
// Header formats seen in the wild:
//   "Quarterly (₹ mn)     Q1 FY23 Q2 FY23 ... Q4FY25 YoY(%) QoQ(%)"  (JASH)
//   "(₹ mn)     Q3FY24    Q4FY24    Q1FY25 ... Q2FY26 YoY%) QoQ(%)"   (CEMPROINDIA)
//
// Strategy: find the first line that contains 3+ quarter refs (Q[1-4]FY\d\d).

function parseQuarterlyRows(text: string): QuarterlyRow[] {
  const lines = text.split("\n");
  let hdrIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(/Q[1-4]\s*FY\d{2}/gi);
    if (matches && matches.length >= 3) {
      hdrIdx = i;
      break;
    }
  }

  if (hdrIdx < 0) return [];

  // Extract quarter labels from the header line
  const hdrLine = lines[hdrIdx];
  const qRe = /Q([1-4])\s*FY(\d{2})/gi;
  const quarters: string[] = [];
  let qm: RegExpExecArray | null;
  while ((qm = qRe.exec(hdrLine)) !== null) {
    quarters.push(`Q${qm[1]}FY${qm[2]}`);
  }

  if (quarters.length === 0) return [];
  const N = quarters.length;

  // Scan lines following the header (next 80 lines, ~3 pages).
  // Stop early if we hit the valuations/balance sheet section ("Year End-March")
  // to prevent ratios-section rows from overwriting quarterly data.
  const rawSegment = lines.slice(hdrIdx + 1, hdrIdx + 80);
  const termIdx = rawSegment.findIndex(l => /Year\s+End[-–\s]*March/i.test(l));
  const segment = termIdx >= 0 ? rawSegment.slice(0, termIdx) : rawSegment;

  const revenues: (number | null)[] = new Array(N).fill(null);
  const ebitda: (number | null)[] = new Array(N).fill(null);
  const ebitdaPct: (number | null)[] = new Array(N).fill(null);
  const netProfit: (number | null)[] = new Array(N).fill(null);

  for (const line of segment) {
    const ns = nums(line);
    if (ns.length < 4) continue;

    // Take first N values; last 1-2 values are typically YoY/QoQ %
    const vals = ns.slice(0, N);
    const lc = line.trim().toLowerCase();

    if (/^revenues?\b/.test(lc)) {
      vals.forEach((v, i) => { revenues[i] = v; });
    } else if (/^ebi[dt]{2}a\b/.test(lc) && !/margin/.test(lc)) {
      // Matches "ebitda" and "ebidta" typo, but not "ebitda margin"
      vals.forEach((v, i) => { ebitda[i] = v; });
    } else if (/ebi[dt]{2}a\s*margin/.test(lc)) {
      vals.forEach((v, i) => { ebitdaPct[i] = v; });
    } else if (/^net\s*profit\b|^pat\b/.test(lc)) {
      vals.forEach((v, i) => { netProfit[i] = v; });
    }
  }

  return quarters.map((q, i) => ({
    quarter: q,
    revenues: revenues[i],
    ebitda: ebitda[i],
    ebitdaPct: ebitdaPct[i],
    netProfit: netProfit[i],
  }));
}

// ── Valuations + Balance Sheet ────────────────────────────────────────────────
//
// Valuations table format (CEMPROINDIA):
//   Year End-March   FY24   FY25   FY26E   FY27E   FY28E   Year End-March   FY24   ...
//   EPS (adj.)        15.9   21.7    31.0    47.9    64.2   Share Capital     172    172   ...
//   P/E               49.0   35.9    25.2    16.3    12.1   Long Term Borr.  1,332  1,183  ...
//   EV/EBITDA         17.9   15.7    12.5     9.2     7.2   Net worth       14,937 18,334  ...
//   ROAE              20.0   22.4    25.6    30.2    30.2   Grand Total     58,877 64,591  ...
//
// The 2-column PDF layout repeats "Year End-March FY24..." on both left and right,
// so years appear TWICE in the header line — we deduplicate them.
// Left N values = ratio column; right N values (last N) = balance sheet column.

function parseRatioAndBS(text: string): {
  ratios: RatioTimeSeries | null;
  balanceSheet: BalanceSeries | null;
} {
  const hdrRe = /Year\s+End[-–\s]*March([^\n]+)/i;
  const hdrMatch = hdrRe.exec(text);
  if (!hdrMatch) return { ratios: null, balanceSheet: null };

  // Extract and deduplicate years
  const yRe = /FY(\d{2}[EP]?)/gi;
  const rawYears: string[] = [];
  let ym: RegExpExecArray | null;
  while ((ym = yRe.exec(hdrMatch[1])) !== null) {
    rawYears.push(`FY${ym[1]}`);
  }

  // Deduplicate (2-column layout repeats the years)
  const seen = new Set<string>();
  const years: string[] = [];
  for (const y of rawYears) {
    const norm = y.replace(/\s/g, "");
    if (!seen.has(norm)) { seen.add(norm); years.push(norm); }
  }

  if (years.length === 0) return { ratios: null, balanceSheet: null };
  const N = years.length;

  const segStart = text.indexOf(hdrMatch[0]) + hdrMatch[0].length;
  const segment = text.slice(segStart, segStart + 6000);
  const lines = segment.split("\n");

  const eps: (number | null)[] = new Array(N).fill(null);
  const pe: (number | null)[] = new Array(N).fill(null);
  const evEbitda: (number | null)[] = new Array(N).fill(null);
  const ebitdaPct: (number | null)[] = new Array(N).fill(null);
  const roe: (number | null)[] = new Array(N).fill(null);

  const equity: (number | null)[] = new Array(N).fill(null);
  const totalDebt: (number | null)[] = new Array(N).fill(null);
  const totalAssets: (number | null)[] = new Array(N).fill(null);

  for (const line of lines) {
    const ns = nums(line);
    // Need at least N values for ratio column (may have more for BS column)
    if (ns.length < N) continue;

    const ratioVals = ns.slice(0, N);
    const bsVals = ns.slice(-N); // last N = balance sheet column

    const lt = line.trim().toLowerCase();

    // ── Ratio metric rows ────────────────────────────────────────────────────
    // EPS: "EPS (adj.)", "A-EPS", "Adj. EPS", "EPS"
    if (/^(?:a-?|adj\.?\s+)?eps\b|^eps\s*\(adj/i.test(lt)) {
      ratioVals.forEach((v, i) => { eps[i] = v; });
    }
    // P/E
    if (/^p\/e\b/.test(lt)) {
      ratioVals.forEach((v, i) => { pe[i] = v; });
    }
    // EV/EBITDA (also "EV/EBIDTA" typo)
    if (/^ev\/ebi[dt]{2}a/.test(lt)) {
      ratioVals.forEach((v, i) => { evEbitda[i] = v; });
    }
    // EBITDA margin (also "EBIDTA margin" typo)
    if (/ebi[dt]{2}a\s*margin/.test(lt)) {
      ratioVals.forEach((v, i) => { ebitdaPct[i] = v; });
    }
    // ROE / ROAE / RoAE — return-on-equity variants only; ROACE is capital-employed, skip it
    if (/\broae?\b|return on (avg\.?|average)?\s*equity/i.test(lt)) {
      ratioVals.forEach((v, i) => { roe[i] = v; });
    }

    // ── Balance sheet keywords (appear mid-line, right column = last N nums) ─
    // "net worth", "net-worth", "networth", "Total net-worth" — hyphen variant seen in CEMPROINDIA
    if (/net[-\s]*worth\b|shareholders'?\s*equity\b|total\s*equity\b/i.test(line)) {
      bsVals.forEach((v, i) => { equity[i] = v; });
    }
    if (/total\s*(?:debt|borrow)\b|long\s*term\s*borrow/i.test(line)) {
      bsVals.forEach((v, i) => { totalDebt[i] = v; });
    }
    if (/total\s*assets?\b|grand\s*total\b/i.test(line)) {
      bsVals.forEach((v, i) => { totalAssets[i] = v; });
    }
  }

  const hasRatios = eps.some((v) => v !== null) || pe.some((v) => v !== null);
  const hasBs = equity.some((v) => v !== null) || totalDebt.some((v) => v !== null);

  return {
    ratios: hasRatios ? { years, eps, pe, evEbitda, ebitdaPct, roe } : null,
    balanceSheet: hasBs ? { years, equity, totalDebt, totalAssets } : null,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

// PARSER_VERSION = "v2-mid-line"

export function parseFinancials(
  chunks: Array<{ text: string; pageNum: number }>,
  source: string
): FinancialSnapshot {
  const text = [...chunks]
    .sort((a, b) => a.pageNum - b.pageNum)
    .map((c) => c.text)
    .join("\n");

  const annual = parseAnnualRows(text);
  const quarterly = parseQuarterlyRows(text);
  const { ratios, balanceSheet } = parseRatioAndBS(text);

  return { source, parserVersion: "v2.3-bsfix", annual, quarterly, ratios, balanceSheet };
}
