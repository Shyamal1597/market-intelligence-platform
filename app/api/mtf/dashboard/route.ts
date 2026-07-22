import { NextResponse } from "next/server";
import {
  getBreadth, getMovers, getContinuousFunders, getLeverageHeatmap,
  getSectorBreakdown, getDivergence,
} from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [breadth, topUp, topDown, funderUp, funderDown, heatmap, sectorBreakdown, divergence] =
    await Promise.all([
      getBreadth(),
      getMovers("up", 1), // just the single top mover, for the breadth tile
      getMovers("down", 1),
      getContinuousFunders("up", 4, 100),
      getContinuousFunders("down", 4, 100),
      getLeverageHeatmap(120),
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
    sectorBreakdown: sectorBreakdown.rows,
    unclassifiedAmt: sectorBreakdown.unclassifiedAmt,
    unclassifiedCount: sectorBreakdown.unclassifiedCount,
    divergence: divergence.rows,
  });
}
