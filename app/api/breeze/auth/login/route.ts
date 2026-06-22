/**
 * GET /api/breeze/auth/login
 * Server-side redirect to the ICICI Breeze login page.
 * The API key never appears in the client response body or browser network tab.
 */
import { NextResponse } from "next/server";
import { getBreezeLoginUrl } from "@/lib/breeze";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(getBreezeLoginUrl(), { status: 302 });
}
