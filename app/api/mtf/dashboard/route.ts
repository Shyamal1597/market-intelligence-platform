import { NextRequest, NextResponse } from "next/server";
import { getBreadth, getMovers, getQuadrant, getTurnoverLeaders } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scopeParam = req.nextUrl.searchParams.get("scope");
  const scope = scopeParam === "coverage" ? "coverage" : "all";

  const [breadth, moversUp, moversDown, quadrant, turnoverLeaders] = await Promise.all([
    getBreadth(scope),
    getMovers(scope, "up", 50),
    getMovers(scope, "down", 50),
    getQuadrant(scope),
    getTurnoverLeaders(scope, 50),
  ]);

  return NextResponse.json({
    scope,
    breadth,
    moversUp: moversUp.rows,
    moversDown: moversDown.rows,
    quadrant: quadrant.points,
    turnoverLeaders: turnoverLeaders.rows,
  });
}
