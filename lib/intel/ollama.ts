// Ollama local-LLM adapter -- same CallJson interface as anthropic.ts
import type { CallJsonOpts, CallJsonResult } from "./anthropic";
import { withRetry } from "./anthropic";
// undici Agent: override headersTimeout (default 30s) for large-transcript prefill
import { Agent } from "undici";

export const MODEL_QWEN   = "qwen2.5:7b";
export const MODEL_LLAMA3 = "llama3.1:8b";

export function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

/** Reusable Agent with extended timeouts for long inference calls. */
const ollamaAgent = new Agent({
  headersTimeout: 600_000,   // 10 min -- long prompts take time to prefill
  bodyTimeout: 1_200_000,    // 20 min -- full generation can run long
  keepAliveTimeout: 10_000,
});

// -- streaming response types -------------------------------------------------

interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  // Final chunk only
  prompt_eval_count?: number;
  eval_count?: number;
}

// -- helpers -------------------------------------------------------------------

/**
 * Read a streaming Ollama /api/chat response to completion.
 * Using stream=true avoids the undici headersTimeout (Ollama sends headers
 * immediately, then streams tokens one by one).
 */
async function readOllamaStream(body: ReadableStream<Uint8Array>): Promise<{
  content: string;
  promptTokens: number;
  evalTokens: number;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let promptTokens = 0;
  let evalTokens = 0;
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Lines are newline-delimited JSON
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";               // keep incomplete line in buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      let chunk: OllamaStreamChunk;
      try { chunk = JSON.parse(line); } catch { continue; }
      content += chunk.message?.content ?? "";
      if (chunk.done) {
        promptTokens = chunk.prompt_eval_count ?? 0;
        evalTokens   = chunk.eval_count        ?? 0;
      }
    }
  }
  // Flush remaining buffer
  if (buf.trim()) {
    try {
      const last: OllamaStreamChunk = JSON.parse(buf);
      content += last.message?.content ?? "";
      if (last.done) {
        promptTokens = last.prompt_eval_count ?? promptTokens;
        evalTokens   = last.eval_count        ?? evalTokens;
      }
    } catch { /* ignore incomplete last line */ }
  }
  return { content, promptTokens, evalTokens };
}

// -- main export ---------------------------------------------------------------

export async function callJson<T>(opts: CallJsonOpts): Promise<CallJsonResult<T>> {
  const reqBody = {
    model:   opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user",   content: opts.user },
    ],
    stream: true,     // stream=true: headers arrive immediately, avoids undici headersTimeout
    format: "json",   // forces JSON-mode grammar -- prevents prose responses
    options: {
      temperature: opts.temperature ?? 0,
      num_predict: opts.maxTokens ?? 8192,  // 8k output cap; enough for most quarters at 20k context
      // 20k context: model (5.9GB) + KV cache (1.15GB) = 7.05GB → fits RTX 4060 8GB.
      // 24k context: KV cache ~1.38GB → total ~7.58GB → still fits, needed for verbose transcripts.
      // 32k context: KV cache ~1.84GB → total >8GB → VRAM spill → ~3 tps (avoid).
      // Pass numCtx=24576 for long transcripts where 20k output budget is insufficient.
      num_ctx: opts.numCtx ?? 20480,
    },
  };

  const { content, promptTokens, evalTokens } = await withRetry(async () => {
    const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      // @ts-expect-error -- undici dispatcher not in standard RequestInit types
      dispatcher: ollamaAgent,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "(no body)");
      throw new Error(`Ollama HTTP ${res.status}: ${msg}`);
    }
    if (!res.body) throw new Error("Ollama returned empty body");
    return readOllamaStream(res.body);
  }, opts.retryOpts);

  // Strip markdown code fences -- local models occasionally wrap JSON output
  const raw = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/,        "")
    .trim();

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    throw new Error(`Ollama returned non-JSON: ${raw.slice(0, 300)}...`);
  }

  return {
    data:              parsed,
    inputTokens:       promptTokens,
    outputTokens:      evalTokens,
    cacheReadTokens:   0,
    cacheCreateTokens: 0,
  };
}

/** Local models are free -- always returns 0. */
export function estimateCostUsd(
  _model: string,
  _r: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreateTokens?: number },
): number {
  return 0;
}
