import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const notesDir = path.join(
      process.cwd(),
      "public",
      "notes",
      symbol.toUpperCase()
    );

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
