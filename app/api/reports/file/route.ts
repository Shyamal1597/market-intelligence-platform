import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const REPORTS_BASE = path.resolve("D:\\Sunidhi Intranet\\Research Reports");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const encodedPath = searchParams.get("p");
  if (!encodedPath) {
    return NextResponse.json({ error: "p param required" }, { status: 400 });
  }

  let filePath: string;
  try {
    // Decode URL-safe base64 (btoa + URL-safe substitution)
    const b64 = encodedPath.replace(/-/g, "+").replace(/_/g, "/");
    filePath = Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "invalid path encoding" }, { status: 400 });
  }

  // Security: canonicalize and assert within allowed base
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(REPORTS_BASE)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(resolved);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(resolved)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
