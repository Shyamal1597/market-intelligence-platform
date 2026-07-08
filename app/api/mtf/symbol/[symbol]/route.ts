import { NextResponse } from "next/server";
import { getSymbolHistory } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  const history = await getSymbolHistory(symbol);
  return NextResponse.json({ symbol, history });
}
