/**
 * LLM backend router.
 *
 * Uses Anthropic Claude when ANTHROPIC_API_KEY is present in env;
 * falls back to a local Ollama instance otherwise.
 *
 * Import callJson / estimateCostUsd from here instead of directly from
 * anthropic.ts or ollama.ts so the extraction pipeline is backend-agnostic.
 */
import * as anthropicAdapter from "./anthropic";
import * as ollamaAdapter    from "./ollama";

export type { CallJsonOpts, CallJsonResult } from "./anthropic";
export { withRetry } from "./anthropic";

// ── Model constants ───────────────────────────────────────────────────────────
export const {
  MODEL_HAIKU,
  MODEL_SONNET,
} = anthropicAdapter;

export const {
  MODEL_QWEN,
  MODEL_LLAMA3,
} = ollamaAdapter;

// ── Backend detection ─────────────────────────────────────────────────────────
export type Backend = "anthropic" | "ollama";

export function activeBackend(): Backend {
  // LLM_BACKEND=ollama forces local mode even when ANTHROPIC_API_KEY is present.
  const forced = process.env.LLM_BACKEND as Backend | undefined;
  if (forced === "ollama" || forced === "anthropic") return forced;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

/**
 * The model to use for extraction (Stage 3 — many small calls).
 * Anthropic: claude-haiku-4-5  |  Ollama: qwen2.5:7b
 */
export function defaultExtractionModel(): string {
  return activeBackend() === "anthropic"
    ? anthropicAdapter.MODEL_HAIKU
    : ollamaAdapter.MODEL_QWEN;
}

/**
 * The model to use for cross-checking (Stage 4 — fewer, richer calls).
 * Anthropic: claude-sonnet-4-6  |  Ollama: qwen2.5:7b (same; no bigger local model)
 */
export function defaultVerificationModel(): string {
  return activeBackend() === "anthropic"
    ? anthropicAdapter.MODEL_SONNET
    : ollamaAdapter.MODEL_QWEN;
}

// ── Unified callJson ──────────────────────────────────────────────────────────
export async function callJson<T>(
  opts: anthropicAdapter.CallJsonOpts,
): Promise<anthropicAdapter.CallJsonResult<T>> {
  if (activeBackend() === "anthropic") return anthropicAdapter.callJson<T>(opts);
  return ollamaAdapter.callJson<T>(opts);
}

// ── Unified cost estimation ───────────────────────────────────────────────────
export function estimateCostUsd(
  model: string,
  r: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreateTokens?: number;
  },
): number {
  if (activeBackend() === "anthropic") return anthropicAdapter.estimateCostUsd(model, r);
  return ollamaAdapter.estimateCostUsd(model, r);
}
