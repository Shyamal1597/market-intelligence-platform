import { NextResponse } from "next/server";
import { getBreadthSymbols } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ direction: string }> },
) {
  const { direction } = await params;
  if (direction !== "up" && direction !== "down" && direction !== "flat") {
    return NextResponse.json({ error: "Invalid direction -- expected up, down, or flat." }, { status: 400 });
  }
  const rows = await getBreadthSymbols(direction);
  return NextResponse.json({ direction, rows });
}
