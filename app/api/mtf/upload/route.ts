import { NextResponse } from "next/server";
import { ingestMtfWorkbook } from "@/lib/mtf/ingest";
import { getIngestVerification } from "@/lib/mtf/queries";

export const dynamic = "force-dynamic";

/** Maximum upload size: 5 MB (source files run ~1.3MB). */
const MAX_SIZE = 5 * 1024 * 1024;

/** Legacy BIFF .xls magic bytes: D0 CF 11 E0 (OLE2 Compound File). */
const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/**
 * POST /api/mtf/upload
 * Upload a Margin Trading Volume Wise Report .xls file. Trade date and all
 * rows are derived from the file's own BHAVCOPY sheet, not the filename.
 *
 * Request: multipart/form-data, field "file"
 * Response: { date, rowsIngested, mtfRowCount, bhavRowCount, warnings }
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xls")) {
      return NextResponse.json({ error: "Only .xls files are accepted." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(XLS_MAGIC)) {
      return NextResponse.json(
        { error: "File does not appear to be a valid legacy .xls file." },
        { status: 400 },
      );
    }

    const summary = await ingestMtfWorkbook(buffer);
    const verification = summary.date ? await getIngestVerification(summary.date) : null;
    return NextResponse.json({ ...summary, verification });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[mtf/upload] Error:", msg);

    if (
      msg.includes("not found in workbook") ||
      msg.includes("no data rows") ||
      msg.includes("Could not parse a trade date") ||
      msg.includes("no rows with a parseable symbol")
    ) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: "Internal server error during MTF report upload." }, { status: 500 });
  }
}
