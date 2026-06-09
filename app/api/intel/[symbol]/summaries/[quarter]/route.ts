import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { QuarterSummary } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string; quarter: string }> },
) {
  const { symbol: rawSymbol, quarter } = await params;
  const symbol = rawSymbol.toUpperCase();

  if (!SYMBOL_SECTOR[symbol]) {
    return NextResponse.json({ error: "unknown symbol" }, { status: 404 });
  }

  const filePath = path.join(
    "data/intelligence",
    symbol,
    "summaries",
    `${quarter}.json`,
  );

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const summary = JSON.parse(raw) as QuarterSummary;
    return NextResponse.json(summary);
  } catch {
    // Not generated yet -- return pending instead of 404 so UI can show placeholder
    return NextResponse.json({ pending: true }, { status: 200 });
  }
}
