import { NextRequest } from "next/server";
import { getDb, type ReportRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const OLLAMA_URL = "http://localhost:11434/api/chat";

// Strip common English stop words so FTS5 implicit AND doesn't kill recall
const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","should","could","may","might",
  "what","which","who","whom","where","when","why","how",
  "i","me","my","we","our","you","your","he","his","she","her","it","its","they","their",
  "this","that","these","those","of","in","to","for","on","at","from","by","with",
  "and","or","but","not","as","so","if","about","up","out","all","any","some","no",
]);

function toFtsQuery(raw: string): string {
  const keywords = raw
    .replace(/['"*^?()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
  if (keywords.length === 0) return raw.replace(/['"*^?()]/g, " ").trim();
  // OR mode + prefix wildcard (*) for partial matching (e.g. "manufactur*" → "manufacturing")
  return keywords.map(k => `${k}*`).join(" OR ");
}

/**
 * Scan query text for company name or NSE symbol mentions.
 * Returns { symbol, company } if found, or null.
 * Companies sorted longest-first so "HDFC Bank" matches before "HDFC".
 */
function detectCompanyInQuery(
  query: string,
  db: ReturnType<typeof import("better-sqlite3")>
): { symbol: string; company: string } | null {
  const rows = (db as any)
    .prepare(
      "SELECT DISTINCT company, symbol FROM reports WHERE symbol != '' ORDER BY LENGTH(company) DESC"
    )
    .all() as { company: string; symbol: string }[];

  const queryLower = query.toLowerCase();

  // 1. Check company names (longest first to avoid partial shadowing)
  for (const row of rows) {
    const cLower = row.company.toLowerCase();
    if (cLower.length >= 3 && queryLower.includes(cLower)) {
      return { symbol: row.symbol, company: row.company };
    }
  }

  // 2. Check for all-caps NSE symbol token in query (e.g. "INFY", "PAYTM")
  const symbolTokens = query.match(/\b[A-Z]{2,12}\b/g) ?? [];
  const symbolSet = new Map(rows.map(r => [r.symbol, r.company]));
  for (const tok of symbolTokens) {
    if (symbolSet.has(tok)) {
      return { symbol: tok, company: symbolSet.get(tok)! };
    }
  }

  return null;
}

function makeSSE(encoder: TextEncoder, payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    symbol?: string;
    analyst?: string;
    topK?: number;
  };

  const { query, symbol, analyst, topK = 6 } = body;
  if (!query?.trim()) return new Response("query required", { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = await getDb();

        // Auto-detect company/symbol from query when not explicitly provided
        let effectiveSymbol = symbol;
        if (!effectiveSymbol && !analyst) {
          const detected = detectCompanyInQuery(query, db as any);
          if (detected) effectiveSymbol = detected.symbol;
        }

        // ── SQLite FTS5 search (built-in BM25 ranking) ────────────────────────
        let ftsQuery = `
          SELECT c.text, c.reportId, c.pageNum
          FROM chunks_fts
          JOIN chunks c ON chunks_fts.rowid = c.rowid
        `;
        const params: (string | number)[] = [];

        if (effectiveSymbol || analyst) {
          ftsQuery += `
            JOIN reports r ON c.reportId = r.id
            WHERE chunks_fts MATCH ?
          `;
          params.push(toFtsQuery(query));
          if (effectiveSymbol) { ftsQuery += " AND r.symbol = ?";            params.push(effectiveSymbol.toUpperCase()); }
          if (analyst)         { ftsQuery += " AND LOWER(r.analyst) LIKE ?"; params.push(`%${analyst.toLowerCase()}%`); }
        } else {
          ftsQuery += " WHERE chunks_fts MATCH ?";
          params.push(toFtsQuery(query));
        }

        ftsQuery += " ORDER BY rank LIMIT ?";
        params.push(topK);

        const hits = db.prepare(ftsQuery).all(...params) as { text: string; reportId: string; pageNum: number }[];

        // Fetch source report metadata
        const reportIds = [...new Set(hits.map(h => h.reportId))];
        const sources: ReportRow[] = reportIds
          .map(id => db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow)
          .filter(Boolean);

        controller.enqueue(makeSSE(encoder, { type: "sources", sources }));

        if (hits.length === 0) {
          controller.enqueue(makeSSE(encoder, { type: "delta", text: "No relevant reports found for this query." }));
          controller.enqueue(makeSSE(encoder, { type: "done" }));
          controller.close();
          return;
        }

        // ── Build context for Ollama ──────────────────────────────────────────
        const contextBlock = hits.map(h => {
          const src = sources.find(s => s.id === h.reportId);
          const header = src
            ? `[${src.company} — ${src.analyst}, ${src.date}, ${src.rating}]`
            : `[report ${h.reportId}]`;
          return `${header}\n${h.text}`;
        }).join("\n---\n");

        const systemPrompt = `You are an equity research analyst assistant.
Answer questions based ONLY on the research reports provided below.
If the answer is not in the reports, say so clearly.
Be concise. Cite the company and analyst name when referencing a report.

<context>
${contextBlock}
</context>`;

        // ── Stream from Ollama ────────────────────────────────────────────────
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
          controller.enqueue(makeSSE(encoder, {
            type: "delta",
            text: `Ollama error: ${ollamaRes.status} — is llama3.1:8b running?`,
          }));
          controller.enqueue(makeSSE(encoder, { type: "done" }));
          controller.close();
          return;
        }

        const reader = ollamaRes.body.getReader();
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n").filter(Boolean)) {
            try {
              const parsed = JSON.parse(line) as { message?: { content?: string } };
              if (parsed.message?.content) {
                controller.enqueue(makeSSE(encoder, { type: "delta", text: parsed.message.content }));
              }
            } catch { /* partial line */ }
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
