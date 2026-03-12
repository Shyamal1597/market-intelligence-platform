/**
 * POST /api/breeze/callback?apisession=XXX
 * GET  /api/breeze/callback?apisession=XXX  (fallback)
 *
 * ICICI Direct POSTs here after user logs in via the Breeze login URL.
 * The session token arrives as the `apisession` query parameter.
 * We validate the token, persist it, then redirect the user back to coverage.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateBreezeSession } from "@/lib/breeze";

export const dynamic = "force-dynamic";

async function handleCallback(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("apisession");

  if (!token) {
    return new NextResponse(
      html("Breeze Auth Failed", "No apisession in redirect URL.", false),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const result = await generateBreezeSession(token);

  if (!result.success) {
    return new NextResponse(
      html("Breeze Auth Failed", result.error ?? "Unknown error", false),
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  // Redirect back to the results/coverage page with success flag
  return NextResponse.redirect(
    new URL("/results?breeze=connected", req.nextUrl.origin)
  );
}

// ICICI Direct POSTs to the callback URL
export async function POST(req: NextRequest) {
  return handleCallback(req);
}

// Also support GET for manual testing / re-auth flows
export async function GET(req: NextRequest) {
  return handleCallback(req);
}

function html(title: string, message: string, ok: boolean): string {
  const color = ok ? "#00C9A7" : "#E84040";
  return `<!DOCTYPE html>
<html style="background:#0C0E14;color:#F0EDE8;font-family:JetBrains Mono,monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<body style="text-align:center">
  <div>
    <p style="font-size:2rem;margin-bottom:1rem">${ok ? "✓" : "✗"}</p>
    <h2 style="color:${color};margin-bottom:.5rem">${title}</h2>
    <p style="color:#7A8099;font-size:.85rem">${message}</p>
    <p style="margin-top:1.5rem"><a href="/results" style="color:#F5820D">← Back to Results</a></p>
  </div>
</body>
</html>`;
}
