import { NextRequest, NextResponse } from "next/server";
import { removeFromWatchlist, patchWatchlistEntry } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    await removeFromWatchlist(symbol.toUpperCase());
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const body = await req.json() as Record<string, unknown>;
    const updated = await patchWatchlistEntry(symbol.toUpperCase(), body);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
