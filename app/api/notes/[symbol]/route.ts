import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSym } = await params;
    const sym = rawSym.toUpperCase();
    if (!/^[A-Z0-9&-]{1,20}$/.test(sym)) {
      return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
    }
    const notesDir = path.join(process.cwd(), "public", "notes", sym);
    const notesBase = path.join(process.cwd(), "public", "notes");
    if (!path.resolve(notesDir).startsWith(notesBase + path.sep) &&
        path.resolve(notesDir) !== notesBase) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const symbol = sym;

    let files: string[];
    try {
      const entries = await fs.readdir(notesDir, { withFileTypes: true });
      files = entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
        .map((e) => e.name)
        .sort();
    } catch {
      files = []; // directory doesn't exist
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      files: files.map((f) => ({
        name: f,
        url: `/notes/${symbol.toUpperCase()}/${encodeURIComponent(f)}`,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
