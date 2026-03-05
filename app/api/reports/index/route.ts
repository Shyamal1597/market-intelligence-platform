import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Indexing is done via: node scripts/index-reports.mjs
// This endpoint just returns current DB stats.
export async function GET() {
  try {
    const db = await getDb();
    const reports = (db.prepare("SELECT COUNT(*) as n FROM reports").get() as { n: number }).n;
    const chunks  = (db.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }).n;
    return NextResponse.json({ reports, chunks });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
