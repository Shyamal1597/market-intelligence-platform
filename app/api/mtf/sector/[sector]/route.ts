import { NextResponse } from "next/server";
import { getSectorSymbols } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sector: string }> },
) {
  const { sector } = await params;
  const rows = await getSectorSymbols(sector);
  return NextResponse.json({ sector, rows });
}
