import { NextResponse } from "next/server";
import { indexReports } from "@/lib/reportIndexer";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — 161 PDFs take time

export async function POST() {
  try {
    const result = await indexReports((msg) => console.log("[index]", msg));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[index] fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
