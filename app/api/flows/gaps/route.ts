/**
 * GET /api/flows/gaps
 *
 * Returns missing trading dates from the FII/DII history, plus
 * current MTD/YTD sums and the expected entry count.
 *
 * "Trading day" = any weekday not in the KNOWN_HOLIDAYS list.
 * We can't know every BSE holiday in advance, so holidays appear as
 * "maybe missing" -- they have a flag so the UI can explain the caveat.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const HISTORY_PATH = path.join(process.cwd(), "data", "fii-dii-history.json");

// Known BSE market holidays FY 26-27 (Apr 2026 - Mar 2027)
const KNOWN_HOLIDAYS_FY2627 = new Set([
  "2026-04-01", // Ram Navami
  "2026-04-14", // Dr. B R Ambedkar Jayanti
  "2026-04-17", // Good Friday
  "2026-05-01", // Maharashtra Day
  "2026-05-12", // Buddha Purnima
  // Add more as they are declared
]);

// Also check FY 25-26 trailing holidays if any stored entries are that old
const KNOWN_HOLIDAYS_FY2526 = new Set([
  "2025-10-02", // Gandhi Jayanti
  "2025-10-24", // Dussehra
  "2025-11-05", // Diwali Laxmi Puja
  "2025-11-15", // Gurunanak Jayanti
  "2025-12-25", // Christmas
  "2026-01-26", // Republic Day
  "2026-02-19", // Chhatrapati Shivaji Maharaj Jayanti
  "2026-03-20", // Holi
]);

const ALL_HOLIDAYS = new Set([...KNOWN_HOLIDAYS_FY2627, ...KNOWN_HOLIDAYS_FY2526]);

interface StoredEntry {
  date: string;
  fiiEquityNet: number;
  diiEquityNet: number;
}

function isWeekday(isoDate: string): boolean {
  const d = new Date(isoDate + "T00:00:00");
  const dow = d.getDay(); // 0=Sun, 6=Sat
  return dow !== 0 && dow !== 6;
}

function allWeekdays(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (isWeekday(iso)) dates.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export async function GET() {
  try {
    const raw  = await fs.readFile(HISTORY_PATH, "utf-8");
    const all: StoredEntry[] = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];

    const today = new Date().toISOString().slice(0, 10);

    // FY26-27 starts April 1, 2026
    const fyStart = "2026-04-01";

    const stored   = new Set(all.map((e) => e.date));
    const weekdays = allWeekdays(fyStart, today);

    const missing: Array<{ date: string; isKnownHoliday: boolean }> = [];
    for (const d of weekdays) {
      if (!stored.has(d)) {
        missing.push({ date: d, isKnownHoliday: ALL_HOLIDAYS.has(d) });
      }
    }

    // Confirmed gaps = not a known holiday
    const gaps = missing.filter((m) => !m.isKnownHoliday);

    // MTD / YTD sums
    const ymToday = today.slice(0, 7);
    const ytdEntries = all.filter((e) => e.date >= fyStart);
    const mtdEntries = all.filter((e) => e.date.slice(0, 7) === ymToday);

    const fiiMtd = mtdEntries.reduce((s, e) => s + e.fiiEquityNet, 0);
    const fiiYtd = ytdEntries.reduce((s, e) => s + e.fiiEquityNet, 0);
    const diiMtd = mtdEntries.reduce((s, e) => s + e.diiEquityNet, 0);
    const diiYtd = ytdEntries.reduce((s, e) => s + e.diiEquityNet, 0);

    return NextResponse.json({
      fyStart,
      today,
      storedCount:  ytdEntries.length,
      expectedWeekdays: weekdays.length,
      missingDates: missing,  // includes holidays
      gapDates:     gaps,     // confirmed missing trading days
      gapCount:     gaps.length,
      sums: {
        fiiMtd: +fiiMtd.toFixed(2),
        fiiYtd: +fiiYtd.toFixed(2),
        diiMtd: +diiMtd.toFixed(2),
        diiYtd: +diiYtd.toFixed(2),
        mtdDays: mtdEntries.length,
        ytdDays: ytdEntries.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
