import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await params; // symbol not needed -- BSE uses bseCode
    const bseCode = req.nextUrl.searchParams.get("bseCode");
    if (!bseCode) {
      return NextResponse.json({ error: "bseCode query param required" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.bseindia.com/BseIndiaAPI/api/Shareholding/w?scripcode=${bseCode}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          Referer: "https://www.bseindia.com/",
          Origin: "https://www.bseindia.com",
        },
        next: { revalidate: 0 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `BSE API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[shareholding]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
