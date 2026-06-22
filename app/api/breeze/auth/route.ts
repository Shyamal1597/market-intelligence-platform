/**
 * GET /api/breeze/auth
 * Returns { loggedIn: boolean, loginUrl: string }
 *
 * DELETE /api/breeze/auth
 * Clears the stored session (logout)
 */

import { NextResponse } from "next/server";
import { getBreezeSession, getBreezeLoginUrl, clearBreezeSession } from "@/lib/breeze";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = getBreezeSession();
  return NextResponse.json({
    loggedIn: token !== null,
    // loginUrl intentionally omitted — use GET /api/breeze/auth/login for redirect
  });
}

export async function DELETE() {
  clearBreezeSession();
  return NextResponse.json({ ok: true });
}
