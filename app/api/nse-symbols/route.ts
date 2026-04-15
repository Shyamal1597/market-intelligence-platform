import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const SCRIP_MAP_PATH = path.join(process.cwd(), "data", "breeze-scrip-map.json");

// In-memory cache so we only parse the file once per server lifetime
let _cachedSymbols: string[] | null = null;

function getEquitySymbols(): string[] {
  if (_cachedSymbols) return _cachedSymbols;
  try {
    const raw = fs.readFileSync(SCRIP_MAP_PATH, "utf-8");
    const data = JSON.parse(raw) as { map: Record<string, string> };
    // Keep only equity-like symbols: uppercase alpha + optional & - .
    // Exclude bond/G-sec codes which contain digits
    // NSE equity symbols are purely alphabetic (plus & and - for names like M&M, BAJAJ-AUTO).
    // Bond/G-sec codes contain digits (RECN12, 702GS2031, 426E23) — exclude them by
    // rejecting any symbol that contains a digit anywhere.
    _cachedSymbols = Object.keys(data.map)
      .filter(k => /^[A-Z][A-Z&\-]{0,18}[A-Z]$/.test(k) || /^[A-Z]{2,4}$/.test(k))
      .sort();
    return _cachedSymbols;
  } catch {
    return [];
  }
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").toUpperCase().trim();
  if (!q) return Response.json({ symbols: [] });

  const all = getEquitySymbols();
  // Prefix matches first, then substring matches
  const prefix = all.filter(s => s.startsWith(q));
  const contains = all.filter(s => !s.startsWith(q) && s.includes(q));
  const results = [...prefix, ...contains].slice(0, 10);

  return Response.json({ symbols: results });
}
