import Anthropic from "@anthropic-ai/sdk";

// Current model IDs as of 2026-05-04.
export const MODEL_HAIKU  = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-4-6";

export interface RetryOptions { tries: number; baseMs: number; }

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = { tries: 3, baseMs: 1000 }): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < opts.tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < opts.tries - 1) {
        await new Promise((r) => setTimeout(r, opts.baseMs * Math.pow(4, i)));
      }
    }
  }
  throw lastErr;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing — see .env.local.example");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface CallJsonOpts {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  cacheControl?: boolean;
  /** Override retry behaviour — useful in tests to skip backoff delays. */
  retryOpts?: RetryOptions;
  /** Override context window size (Ollama-only — ignored by Anthropic). */
  numCtx?: number;
}

export interface CallJsonResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

/** Issue a JSON-mode call. Caller is responsible for instructing the model to output valid JSON. */
export async function callJson<T>(opts: CallJsonOpts): Promise<CallJsonResult<T>> {
  const c = client();
  const sys = opts.cacheControl
    ? [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }]
    : opts.system;

  const resp = await withRetry(() => c.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0,
    system: sys as never,
    messages: [{ role: "user", content: opts.user }],
  }), opts.retryOpts);

  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Anthropic response had no text block");
  let parsed: T;
  try {
    // Strip markdown code fences if the model wraps its JSON in them
    const raw = block.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(raw) as T;
  } catch {
    throw new Error(`Anthropic returned non-JSON: ${block.text.slice(0, 200)}...`);
  }

  const u = resp.usage as unknown as {
    input_tokens?: number; output_tokens?: number;
    cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
  };
  return {
    data: parsed,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreateTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export function estimateCostUsd(model: string, r: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreateTokens?: number }): number {
  const RATES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
    [MODEL_HAIKU]:  { in: 1.0,  out: 5.0,  cacheRead: 0.10, cacheWrite: 1.25 },
    [MODEL_SONNET]: { in: 3.0,  out: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  };
  const rate = RATES[model];
  if (!rate) return 0;
  return (
    (r.inputTokens / 1_000_000) * rate.in +
    (r.outputTokens / 1_000_000) * rate.out +
    ((r.cacheReadTokens ?? 0) / 1_000_000) * rate.cacheRead +
    ((r.cacheCreateTokens ?? 0) / 1_000_000) * rate.cacheWrite
  );
}
