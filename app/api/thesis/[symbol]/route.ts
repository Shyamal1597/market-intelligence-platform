import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const THESIS_DIR = path.join(process.cwd(), "data", "thesis");

interface ThesisData {
  bull: string;
  bear: string;
  updatedAt: string;
}

async function loadThesis(symbol: string): Promise<ThesisData> {
  try {
    const raw = await fs.readFile(
      path.join(THESIS_DIR, `${symbol}.json`),
      "utf-8"
    );
    return JSON.parse(raw) as ThesisData;
  } catch {
    return { bull: "", bear: "", updatedAt: "" };
  }
}

const SYMBOL_RE = /^[A-Z0-9&-]{1,20}$/;

function safeSymbol(raw: string): string | null {
  const sym = raw.toUpperCase();
  if (!SYMBOL_RE.test(sym)) return null;
  const resolved = path.resolve(THESIS_DIR, `${sym}.json`);
  if (!resolved.startsWith(THESIS_DIR + path.sep)) return null;
  return sym;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await params;
  const symbol = safeSymbol(raw);
  if (!symbol) return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  const data = await loadThesis(symbol);
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: raw } = await params;
    const symbol = safeSymbol(raw);
    if (!symbol) return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
    const body = await req.json() as { bull?: string; bear?: string };
    const existing = await loadThesis(symbol);
    const updated: ThesisData = {
      bull: typeof body.bull === "string" ? body.bull : existing.bull,
      bear: typeof body.bear === "string" ? body.bear : existing.bear,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(THESIS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(THESIS_DIR, `${symbol}.json`),
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to save thesis" }, { status: 500 });
  }
}
