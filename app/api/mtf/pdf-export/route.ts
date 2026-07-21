import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  getBreadth, getMovers, getContinuousFunders, getLeverageHeatmap, getTurnoverLeaders,
  getSectorBreakdown, getDivergence,
} from "@/lib/mtf/queries";
import { curateForPdf } from "@/lib/mtf/pdf/curate";
import { MtfReportDocument } from "@/lib/mtf/pdf/MtfReportDocument";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [breadth, topUp, topDown, fundersUp, fundersDown, heatmap, turnoverLeaders, sectorBreakdown, divergence] =
      await Promise.all([
        getBreadth(),
        getMovers("up", 1),
        getMovers("down", 1),
        getContinuousFunders("up", 4, 50),
        getContinuousFunders("down", 4, 50),
        getLeverageHeatmap(120),
        getTurnoverLeaders(50),
        getSectorBreakdown(),
        getDivergence(30),
      ]);

    if (!breadth.date) {
      return NextResponse.json(
        { error: "No MTF data ingested yet -- upload a Margin Trading report first." },
        { status: 409 },
      );
    }

    const buf = await renderToBuffer(
      MtfReportDocument({
        data: {
          date: breadth.date,
          breadth,
          topGainer: topUp.rows[0] ?? null,
          topLoser: topDown.rows[0] ?? null,
          sectors: curateForPdf.sectors(sectorBreakdown.rows),
          unclassifiedAmt: sectorBreakdown.unclassifiedAmt,
          unclassifiedCount: sectorBreakdown.unclassifiedCount,
          fundersUp: curateForPdf.continuousFunders(fundersUp.rows),
          fundersDown: curateForPdf.continuousFunders(fundersDown.rows),
          turnoverLeaders: curateForPdf.turnoverLeaders(turnoverLeaders.rows),
          divergence: curateForPdf.divergence(divergence.rows),
          topMovers: curateForPdf.topMovers(heatmap.nodes),
        },
      }),
    );

    const dateSuffix = breadth.date.split("-").reverse().join("."); // "2026-07-17" -> "17.07.2026"

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MTF Market Pulse - ${dateSuffix}.pdf"`,
      },
    });
  } catch (error) {
    console.error("MTF PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate MTF Market Pulse report", detail: String(error) },
      { status: 500 },
    );
  }
}
