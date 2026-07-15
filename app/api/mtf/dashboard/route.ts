import { NextResponse } from "next/server";
import { getBreadth, getMovers, getLeverageHeatmap, getTurnoverLeaders } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [breadth, moversUp, moversDown, heatmap, turnoverLeaders] = await Promise.all([
    getBreadth(),
    getMovers("up", 50),
    getMovers("down", 50),
    getLeverageHeatmap(120),
    getTurnoverLeaders(50),
  ]);

  return NextResponse.json({
    breadth,
    moversUp: moversUp.rows,
    moversDown: moversDown.rows,
    heatmap: heatmap.nodes,
    turnoverLeaders: turnoverLeaders.rows,
  });
}
