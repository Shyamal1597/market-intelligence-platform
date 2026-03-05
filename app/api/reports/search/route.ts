import { NextRequest } from "next/server";
import { readChunks, readMetadata, type Chunk, type ReportMeta } from "@/lib/reportIndexer";
import { buildIndex, search, type BM25Doc } from "@/lib/bm25";

export const dynamic = "force-dynamic";

// Module-level cache — reload on server restart
let chunkCache: Chunk[] | null = null;
let metaCache: ReportMeta[] | null = null;
let indexCache: ReturnType<typeof buildIndex> | null = null;

async function getIndex(symbol?: string, analyst?: string) {
  if (!chunkCache) chunkCache = await readChunks();
  if (!metaCache) metaCache = await readMetadata();

  let chunks = chunkCache;

  // Scope BM25 to filtered set if filters provided
  if (symbol || analyst) {
    const validIds = new Set(
      metaCache
        .filter(
          (m) =>
            (!symbol || m.symbol === symbol.toUpperCase()) &&
            (!analyst || m.analyst.toLowerCase().includes(analyst.toLowerCase()))
        )
        .map((m) => m.id)
    );
    chunks = chunks.filter((c) => validIds.has(c.reportId));
  }

  // Only cache unfiltered index
  if (!symbol && !analyst) {
    if (!indexCache) indexCache = buildIndex(chunks as unknown as BM25Doc[]);
    return { index: indexCache, meta: metaCache };
  }

  return { index: buildIndex(chunks as unknown as BM25Doc[]), meta: metaCache };
}

function makeSSE(encoder: TextEncoder, payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const OLLAMA_URL = "http://localhost:11434/api/chat";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    symbol?: string;
    analyst?: string;
    topK?: number;
  };

  const { query, symbol, analyst, topK = 6 } = body;

  if (!query?.trim()) {
    return new Response("query required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { index, meta } = await getIndex(symbol, analyst);

        // BM25 retrieval
        const hits = search(index, query, topK) as (BM25Doc & { reportId: string; pageNum: number })[];

        const sources = hits
          .map((h) => meta.find((m) => m.id === h.reportId))
          .filter(Boolean) as ReportMeta[];

        const uniqueSources = sources.filter(
          (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i
        );

        // Send sources first
        controller.enqueue(makeSSE(encoder, { type: "sources", sources: uniqueSources }));

        if (hits.length === 0) {
          controller.enqueue(
            makeSSE(encoder, { type: "delta", text: "No relevant reports found for this query." })
          );
          controller.enqueue(makeSSE(encoder, { type: "done" }));
          controller.close();
          return;
        }

        // Build context block
        const contextBlock = hits
          .map((h) => {
            const m = meta.find((x) => x.id === h.reportId);
            const header = m
              ? `[${m.company} — ${m.analyst}, ${m.date}, ${m.rating}]`
              : `[report ${h.reportId}]`;
            return `${header}\n${h.text}`;
          })
          .join("\n---\n");

        const systemPrompt = `You are an equity research analyst assistant at Sunidhi Capital.
Answer questions based ONLY on the research reports provided below.
If the answer is not in the reports, say so clearly.
Be concise. Cite the company and analyst name when referencing a report.

<context>
${contextBlock}
</context>`;

        // Stream from Ollama
        const ollamaRes = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.1:8b",
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: query },
            ],
          }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
          controller.enqueue(
            makeSSE(encoder, {
              type: "delta",
              text: `Ollama error: ${ollamaRes.status} — is llama3.1:8b running?`,
            })
          );
          controller.enqueue(makeSSE(encoder, { type: "done" }));
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
              const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              if (parsed.message?.content) {
                controller.enqueue(makeSSE(encoder, { type: "delta", text: parsed.message.content }));
              }
            } catch {
              // partial JSON line, skip
            }
          }
        }

        controller.enqueue(makeSSE(encoder, { type: "done" }));
        controller.close();
      } catch (err) {
        controller.enqueue(makeSSE(encoder, { type: "error", message: String(err) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
