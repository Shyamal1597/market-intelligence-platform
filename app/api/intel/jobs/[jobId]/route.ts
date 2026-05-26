import { NextResponse } from "next/server";
import { readJob } from "@/lib/intel/pipeline";

/**
 * GET /api/intel/jobs/:jobId
 *
 * Get the status of a specific pipeline job.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    // Validate jobId format to prevent path traversal
    if (!/^job_[a-z0-9_]+$/i.test(jobId)) {
      return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 });
    }

    const job = await readJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (e) {
    console.error("[intel/jobs] Error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
