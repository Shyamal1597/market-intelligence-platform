/**
 * POST /api/flows/patch
 *
 * Injects or corrects historical FII/DII entries directly into the history file.
 * Body: { entries: Array<{ date, fiiEquityBuy, fiiEquitySell, fiiEquityNet,
 *                          diiEquityBuy, diiEquitySell, diiEquityNet }> }
 *
 * Internal use only — no auth required (internal network, no external exposure).
 */
import { NextRequest, NextResponse } from "next/server";
import { patchFlowHistory } from "@/lib/nse-flows";

export const dynamic = "force-dynamic";

interface PatchEntry {
  date: string;
  fiiEquityBuy: number;
  fiiEquitySell: number;
  fiiEquityNet: number;
  diiEquityBuy: number;
  diiEquitySell: number;
  diiEquityNet: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { entries?: unknown };
    const entries = body?.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Body must be { entries: [...] } with at least one entry" },
        { status: 400 },
      );
    }

    // Validate each entry
    const valid: PatchEntry[] = [];
    for (const e of entries) {
      const entry = e as Record<string, unknown>;
      if (
        typeof entry.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      ) {
        return NextResponse.json(
          { error: `Invalid or missing date: ${JSON.stringify(entry.date)}` },
          { status: 400 },
        );
      }
      valid.push({
        date:           String(entry.date),
        fiiEquityBuy:   Number(entry.fiiEquityBuy  ?? 0),
        fiiEquitySell:  Number(entry.fiiEquitySell ?? 0),
        fiiEquityNet:   Number(entry.fiiEquityNet  ?? 0),
        diiEquityBuy:   Number(entry.diiEquityBuy  ?? 0),
        diiEquitySell:  Number(entry.diiEquitySell ?? 0),
        diiEquityNet:   Number(entry.diiEquityNet  ?? 0),
      });
    }

    const result = await patchFlowHistory(valid);

    return NextResponse.json({
      ok: true,
      saved:   result.saved,
      total:   result.total,
      dates:   valid.map((e) => e.date),
    });
  } catch (err) {
    console.error("[flows/patch] error:", err);
    return NextResponse.json(
      { error: "Patch failed", detail: String(err) },
      { status: 500 },
    );
  }
}
