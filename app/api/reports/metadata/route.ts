import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analyst = searchParams.get("analyst")?.toLowerCase();
  const symbol  = searchParams.get("symbol")?.toUpperCase();

  const db = await getDb();

  let query = "SELECT * FROM reports WHERE 1=1";
  const params: (string | number)[] = [];

  if (analyst) { query += " AND LOWER(analyst) LIKE ?"; params.push(`%${analyst}%`); }
  if (symbol)  { query += " AND symbol = ?"; params.push(symbol); }
  query += " ORDER BY date DESC";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json() as Partial<{ symbol: string; rating: string; cmp: number; targetPrice: number }>;
  const allowed = ["symbol", "rating", "cmp", "targetPrice"] as const;
  const sets = (Object.keys(body) as string[]).filter(k => (allowed as readonly string[]).includes(k));
  if (sets.length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });

  const db = await getDb();
  const sql = `UPDATE reports SET ${sets.map(k => `${k} = ?`).join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...sets.map(k => body[k as keyof typeof body] as string | number), id);

  const updated = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  return NextResponse.json(updated ?? { error: "not found" });
}
