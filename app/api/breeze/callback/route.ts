/**
 * GET /api/breeze/callback?session_token=XXX
 *
 * ICICI Direct redirects here after user logs in via the Breeze login URL.
 * We validate the token against the customerdetails endpoint, persist it,
 * then redirect the user back to the coverage page.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateBreezeSession } from "@/lib/breeze";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("session_token");

  if (!token) {
    return new NextResponse(
      html("Breeze Auth Failed", "No session_token in redirect URL.", false),
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

  // Redirect back to the coverage page with success flag
  return NextResponse.redirect(
    new URL("/coverage?breeze=connected", req.nextUrl.origin)
  );
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
    <p style="margin-top:1.5rem"><a href="/coverage" style="color:#F5820D">← Back to Coverage</a></p>
  </div>
</body>
</html>`;
}
