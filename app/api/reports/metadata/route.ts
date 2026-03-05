import { NextRequest, NextResponse } from "next/server";
import { readMetadata } from "@/lib/reportIndexer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analyst = searchParams.get("analyst")?.toLowerCase();
  const symbol = searchParams.get("symbol")?.toUpperCase();

  let meta = await readMetadata();

  if (analyst) meta = meta.filter((m) => m.analyst.toLowerCase().includes(analyst));
  if (symbol) meta = meta.filter((m) => m.symbol === symbol);

  // Sort newest first
  meta = meta.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json(meta);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json() as Partial<{ symbol: string; rating: string; cmp: number; targetPrice: number }>;
  const meta = await readMetadata();
  const idx = meta.findIndex((m) => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });

  meta[idx] = { ...meta[idx], ...body };

  const { promises: fs } = await import("fs");
  const path = await import("path");
  const dataPath = path.join(process.cwd(), "data", "reports", "metadata.json");
  await fs.writeFile(dataPath, JSON.stringify(meta, null, 2));

  return NextResponse.json(meta[idx]);
}
