import { NextResponse } from "next/server";
import {
  getBreadth, getMovers, getContinuousFunders, getLeverageHeatmap, getTurnoverLeaders,
  getSectorBreakdown, getDivergence,
} from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [breadth, topUp, topDown, funderUp, funderDown, heatmap, turnoverLeaders, sectorBreakdown, divergence] =
    await Promise.all([
      getBreadth(),
      getMovers("up", 1), // just the single top mover, for the breadth tile
      getMovers("down", 1),
      getContinuousFunders("up", 4, 50),
      getContinuousFunders("down", 4, 50),
      getLeverageHeatmap(120),
      getTurnoverLeaders(50),
      getSectorBreakdown(),
      getDivergence(30),
    ]);

  return NextResponse.json({
    breadth,
    topGainer: topUp.rows[0] ?? null,
    topLoser: topDown.rows[0] ?? null,
    continuousFundersUp: funderUp.rows,
    continuousFundersDown: funderDown.rows,
    heatmap: heatmap.nodes,
    turnoverLeaders: turnoverLeaders.rows,
    sectorBreakdown: sectorBreakdown.rows,
    unclassifiedAmt: sectorBreakdown.unclassifiedAmt,
    unclassifiedCount: sectorBreakdown.unclassifiedCount,
    divergence: divergence.rows,
  });
}
