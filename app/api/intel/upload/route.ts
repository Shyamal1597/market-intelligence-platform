import { NextResponse } from "next/server";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { normalizeQuarter } from "@/lib/intel/quarters";
import {
  ingestPdfTranscript,
  runFullPipeline,
  generateJobId,
  writeJob,
  type PipelineJob,
} from "@/lib/intel/pipeline";

/** Maximum upload size: 20 MB */
const MAX_SIZE = 20 * 1024 * 1024;

/**
 * POST /api/intel/upload
 *
 * Upload a transcript PDF for a specific stock. The server extracts text,
 * detects the quarter, saves the transcript, and triggers the full pipeline.
 *
 * Request: multipart/form-data
 *   - file: PDF file (required)
 *   - symbol: NSE ticker (required, must exist in SYMBOL_SECTOR)
 *   - quarter: e.g. "Q1-FY27" (optional — auto-detected if omitted)
 *
 * Response: { jobId, symbol, quarter, status: "processing" }
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const symbol = String(formData.get("symbol") ?? "").toUpperCase().trim();
    const quarterRaw = formData.get("quarter")
      ? String(formData.get("quarter")).trim()
      : undefined;

    // ── Validation ─────────────────────────────────────────────────────────

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field. Upload a PDF file." },
        { status: 400 },
      );
    }

    if (!symbol || !SYMBOL_SECTOR[symbol]) {
      return NextResponse.json(
        {
          error: `Invalid symbol "${symbol}". Valid symbols: ${Object.keys(SYMBOL_SECTOR).join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.` },
        { status: 400 },
      );
    }

    // Validate PDF magic bytes
    const arrayBuf = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuf);
    if (pdfBuffer.length < 5 || pdfBuffer.toString("ascii", 0, 5) !== "%PDF-") {
      return NextResponse.json(
        { error: "File does not appear to be a valid PDF." },
        { status: 400 },
      );
    }

    let quarterOverride: string | undefined;
    if (quarterRaw) {
      const normalized = normalizeQuarter(quarterRaw);
      if (!normalized) {
        return NextResponse.json(
          { error: `Invalid quarter format "${quarterRaw}". Expected format: Q1-FY27` },
          { status: 400 },
        );
      }
      quarterOverride = normalized;
    }

    // ── Ingest ─────────────────────────────────────────────────────────────

    const ingestResult = await ingestPdfTranscript(
      pdfBuffer,
      symbol,
      file.name,
      quarterOverride,
    );

    // ── Create job and trigger pipeline ────────────────────────────────────

    const jobId = generateJobId();
    const job: PipelineJob = {
      id: jobId,
      symbol,
      quarter: ingestResult.quarter,
      status: "running",
      stage: "extract-claims",
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      source: "upload",
      costUsd: 0,
    };
    await writeJob(job);

    // Fire-and-forget pipeline execution with sequential job updates
    (async () => {
      try {
        const pipeResult = await runFullPipeline(symbol, {
          quarter: ingestResult.quarter,
          onProgress: async (stage) => {
            job.stage = stage;
            await writeJob(job).catch(() => {});
          },
        });
        job.status = "complete";
        job.stage = "complete";
        job.completedAt = new Date().toISOString();
        job.costUsd = pipeResult.totalCostUsd;
        await writeJob(job).catch(() => {});
      } catch (e) {
        job.status = "failed";
        job.stage = "failed";
        job.completedAt = new Date().toISOString();
        job.error = (e as Error).message;
        await writeJob(job).catch(() => {});
      }
    })();

    return NextResponse.json({
      jobId,
      symbol,
      quarter: ingestResult.quarter,
      chars: ingestResult.chars,
      alreadyExisted: ingestResult.alreadyExisted,
      status: "processing",
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[intel/upload] Error:", msg);

    // Return user-friendly errors for known failure modes
    if (msg.includes("Could not detect quarter")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    if (msg.includes("text extraction yielded only")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    if (msg.includes("Unknown symbol")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error during transcript upload." },
      { status: 500 },
    );
  }
}
