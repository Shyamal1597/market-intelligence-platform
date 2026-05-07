import { describe, test, expect, vi, beforeEach } from "vitest";
import { callJson, estimateCostUsd, MODEL_QWEN } from "./ollama";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Build a fake streaming ReadableStream from an array of NDJSON lines */
function fakeStream(lines: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ndjson = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjson));
      controller.close();
    },
  });
}

function mockOllamaStream(contentChunks: string[], promptTokens = 100, evalTokens = 50) {
  const lines = [
    ...contentChunks.map((c) => ({
      model: MODEL_QWEN,
      message: { role: "assistant", content: c },
      done: false,
    })),
    {
      model: MODEL_QWEN,
      message: { role: "assistant", content: "" },
      done: true,
      prompt_eval_count: promptTokens,
      eval_count: evalTokens,
    },
  ];
  mockFetch.mockResolvedValueOnce({
    ok: true,
    body: fakeStream(lines),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ollama callJson (streaming mode)", () => {
  test("parses plain JSON response from streamed chunks", async () => {
    mockOllamaStream(['{"claims":', "[]}"]);
    const result = await callJson<{ claims: unknown[] }>({
      model: MODEL_QWEN,
      system: "You are an analyst.",
      user: "Extract claims.",
    });
    expect(result.data).toEqual({ claims: [] });
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreateTokens).toBe(0);
  });

  test("reassembles JSON spread across multiple stream chunks", async () => {
    mockOllamaStream(['{"claims":[{"k', 'ey":"nim"}]}']);
    const result = await callJson<{ claims: unknown[] }>({
      model: MODEL_QWEN, system: "sys", user: "user",
    });
    expect(result.data).toEqual({ claims: [{ key: "nim" }] });
  });

  test("strips markdown code fences before parsing", async () => {
    mockOllamaStream(['```json\n{"claims":[{"key":"nim"}]}\n```']);
    const result = await callJson<{ claims: unknown[] }>({
      model: MODEL_QWEN, system: "sys", user: "user",
    });
    expect(result.data).toEqual({ claims: [{ key: "nim" }] });
  });

  test("strips bare code fence (no language tag)", async () => {
    mockOllamaStream(['```\n{"ok":true}\n```']);
    const result = await callJson<{ ok: boolean }>({
      model: MODEL_QWEN, system: "sys", user: "user",
    });
    expect(result.data.ok).toBe(true);
  });

  test("throws on non-JSON response", async () => {
    mockOllamaStream(["Sorry, I cannot do that."]);
    await expect(
      callJson({ model: MODEL_QWEN, system: "sys", user: "user" })
    ).rejects.toThrow(/non-JSON/);
  });

  test("throws on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "model not found",
    });
    await expect(
      callJson({
        model: MODEL_QWEN, system: "sys", user: "user",
        retryOpts: { tries: 1, baseMs: 1 },
      })
    ).rejects.toThrow(/503/);
  });

  test("sends stream:true and format:json in request body", async () => {
    mockOllamaStream(['{"x":1}']);
    await callJson({
      model: MODEL_QWEN,
      system: "system-text",
      user: "user-text",
      temperature: 0,
      maxTokens: 512,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/chat");
    const body = JSON.parse(init.body);
    expect(body.model).toBe(MODEL_QWEN);
    expect(body.stream).toBe(true);
    expect(body.format).toBe("json");
    expect(body.options.num_ctx).toBe(20480);
    expect(body.options.num_predict).toBe(512);
    expect(body.messages[0]).toEqual({ role: "system", content: "system-text" });
    expect(body.messages[1]).toEqual({ role: "user",   content: "user-text" });
  });

  test("uses 8192 as default num_predict and 20480 as default num_ctx", async () => {
    mockOllamaStream(['{"x":1}']);
    await callJson({ model: MODEL_QWEN, system: "s", user: "u" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.num_predict).toBe(8192);
    expect(body.options.num_ctx).toBe(20480);
  });
});

describe("ollama estimateCostUsd", () => {
  test("always returns 0 regardless of token counts", () => {
    expect(estimateCostUsd(MODEL_QWEN, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
    expect(estimateCostUsd("llama3.1:8b", { inputTokens: 999, outputTokens: 999 })).toBe(0);
  });
});
