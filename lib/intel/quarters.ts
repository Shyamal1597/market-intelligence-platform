// Indian Financial Year quarter helpers.
//
// Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar.
// FY{yy} ends March of year 20{yy}. So Q3-FY26 covers Oct-Dec 2025.
// Bloomberg/CIQ "FQ3 2026" labels also follow this convention for Indian-FY filers.

export type Quarter = string; // "Q{1-4}-FY{yy}"

const Q_RE = /^Q([1-4])-FY(\d{2})$/;

/** Turn an ISO end-of-quarter date into a Q label. Accepts "YYYY-MM-DD" or Date. */
export function dateToQuarter(input: string | Date): Quarter {
  const d = typeof input === "string" ? new Date(input) : input;
  const m = d.getUTCMonth() + 1; // 1..12
  const y = d.getUTCFullYear();
  let q: number, fyEnd: number;
  if (m >= 4 && m <= 6)       { q = 1; fyEnd = y + 1; }
  else if (m >= 7 && m <= 9)  { q = 2; fyEnd = y + 1; }
  else if (m >= 10)            { q = 3; fyEnd = y + 1; }
  else                         { q = 4; fyEnd = y; } // Jan-Mar
  return `Q${q}-FY${String(fyEnd % 100).padStart(2, "0")}`;
}

/** "FQ3 2026" → "Q3-FY26". CIQ uses calendar end-year for the FY label. */
export function bloombergFqToQuarter(label: string): Quarter | null {
  const m = label.match(/^FQ([1-4])\s+(\d{4})$/);
  if (!m) return null;
  return `Q${m[1]}-FY${String(parseInt(m[2]) % 100).padStart(2, "0")}`;
}

/** Accepts "Q3-FY26", "Q3 FY26", "Q3FY26"; returns canonical "Q3-FY26" or null. */
export function normalizeQuarter(s: string): Quarter | null {
  const cleaned = s.replace(/\s+/g, "").toUpperCase();
  const m = cleaned.match(/^Q([1-4])-?FY(\d{2})$/);
  if (!m) return null;
  return `Q${m[1]}-FY${m[2]}`;
}

/** Add a positive or negative number of quarters. */
export function quarterAddOffset(q: Quarter, offset: number): Quarter {
  const m = q.match(Q_RE);
  if (!m) throw new Error(`bad quarter: ${q}`);
  const qi = parseInt(m[1]); // 1..4
  const fy = 2000 + parseInt(m[2]);

  const total = (fy - 2000) * 4 + (qi - 1) + offset;
  const newFy = 2000 + Math.floor(total / 4);
  const newQ = ((total % 4) + 4) % 4 + 1;
  return `Q${newQ}-FY${String(newFy % 100).padStart(2, "0")}`;
}
