import { NextRequest } from "next/server";
import {
  buildPrompt,
  getCached,
  setCached,
  getRecentFiiDii,
  type StreamData,
  type CachedSignal,
} from "@/lib/smart-money";
import { fetchDeals } from "@/lib/nse-deals";
import { fetchNSEFilings } from "@/lib/nse-filings";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

export const dynamic = "force-dynamic";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchDealsForSymbol(symbol: string): Promise<StreamData["bulkBlockDeals"]> {
  try {
    const { deals } = await fetchDeals();
    return deals
      .filter(d => d.symbol?.toUpperCase() === symbol.toUpperCase())
      .slice(0, 5)
      .map(d => ({
        date: d.date ?? "",
        client: d.client ?? "—",
        side: d.side ?? "—",
        quantity: d.quantity ?? 0,
        valueCr: d.valueCr ?? 0,
      }));
  } catch {
    return [];
  }
}

async function fetchAnnouncementsForSymbol(symbol: string): Promise<StreamData["announcements"]> {
  try {
    const filings = await fetchNSEFilings(500);
    return filings
      .filter(f => f.scripCode?.toUpperCase() === symbol.toUpperCase())
      .slice(0, 5)
      .map(f => ({
        date: f.submittedAt ?? "",
        title: f.description ?? f.filingType ?? "",
      }));
  } catch {
    return [];
  }
}

async function fetchInsidersForSymbol(symbol: string): Promise<InsiderDisclosure[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";
    const res = await fetch(`${baseUrl}/api/insider/${encodeURIComponent(symbol)}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const json = await res.json() as { disclosures: InsiderDisclosure[] };
    return json.disclosures ?? [];
  } catch {
    return [];
  }
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const force = req.nextUrl.searchParams.get("force") === "1";

  // Return cached signal if fresh
  if (!force) {
    const cached = getCached(upper);
    if (cached) {
      return new Response(JSON.stringify({ cached: true, signal: cached }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fetch all 4 streams in parallel
  const [deals, announcements, insiders] = await Promise.all([
    fetchDealsForSymbol(upper),
    fetchAnnouncementsForSymbol(upper),
    fetchInsidersForSymbol(upper),
  ]);
  const fiiDii = getRecentFiiDii(5);

  const streamData: StreamData = {
    symbol: upper,
    companyName: upper,
    bulkBlockDeals: deals,
    announcements,
    fiiDii,
    insiders,
  };

  const prompt = buildPrompt(streamData);

  // Stream Ollama response as SSE
  const encoder = new TextEncoder();
  let fullNarrative = "";

  const stream = new ReadableStream({
    async start(controller) {
      // First: send raw data immediately so client can render scorecard
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "raw", data: streamData })}\n\n`)
      );

      try {
        const ollamaRes = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.1:8b",
            prompt,
            stream: true,
            options: { temperature: 0.3 },
          }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Ollama unavailable" })}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = ollamaRes.body.getReader();
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = dec.decode(value).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const chunk = JSON.parse(line) as { response: string; done: boolean };
              if (chunk.response) {
                fullNarrative += chunk.response;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "token", token: chunk.response })}\n\n`)
                );
              }
              if (chunk.done) {
                // Cache the completed signal
                const signal: CachedSignal = {
                  symbol: upper,
                  companyName: upper,
                  rawData: streamData,
                  narrative: fullNarrative,
                  generatedAt: new Date().toISOString(),
                };
                setCached(signal);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "done", signal })}\n\n`)
                );
              }
            } catch { /* malformed JSON chunk — skip */ }
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Failed to connect to Ollama" })}\n\n`)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
