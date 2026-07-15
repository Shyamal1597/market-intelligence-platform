import { NextResponse } from "next/server";
import {
  getBreadth, getMovers, getLeverageHeatmap, getTurnoverLeaders, getSectorBreakdown, getDivergence,
} from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [breadth, moversUp, moversDown, heatmap, turnoverLeaders, sectorBreakdown, divergence] = await Promise.all([
    getBreadth(),
    getMovers("up", 50),
    getMovers("down", 50),
    getLeverageHeatmap(120),
    getTurnoverLeaders(50),
    getSectorBreakdown(),
    getDivergence(30),
  ]);

  return NextResponse.json({
    breadth,
    moversUp: moversUp.rows,
    moversDown: moversDown.rows,
    heatmap: heatmap.nodes,
    turnoverLeaders: turnoverLeaders.rows,
    sectorBreakdown: sectorBreakdown.rows,
    unclassifiedAmt: sectorBreakdown.unclassifiedAmt,
    unclassifiedCount: sectorBreakdown.unclassifiedCount,
    divergence: divergence.rows,
  });
}
