import { NextResponse } from "next/server";
import { getBreadth, getMovers, getQuadrant, getTurnoverLeaders, getSectorBreakdown } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [breadth, moversUp, moversDown, quadrant, turnoverLeaders, sectorBreakdown] = await Promise.all([
    getBreadth(),
    getMovers("up", 50),
    getMovers("down", 50),
    getQuadrant(),
    getTurnoverLeaders(50),
    getSectorBreakdown(),
  ]);

  return NextResponse.json({
    breadth,
    moversUp: moversUp.rows,
    moversDown: moversDown.rows,
    quadrant: quadrant.points,
    turnoverLeaders: turnoverLeaders.rows,
    sectors: sectorBreakdown.sectors,
  });
}
