import { describe, test, expect, vi } from "vitest";
import { withRetry, estimateCostUsd, MODEL_HAIKU, MODEL_SONNET } from "./anthropic";

describe("withRetry", () => {
  test("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, { tries: 3, baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on failure then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    expect(await withRetry(fn, { tries: 3, baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(fn, { tries: 2, baseMs: 1 })).rejects.toThrow(/nope/);
  });
});

describe("estimateCostUsd", () => {
  test("haiku 1M input + 1M output", () => {
    const cost = estimateCostUsd(MODEL_HAIKU, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(6.0, 5); // $1 in + $5 out
  });

  test("sonnet 1M input + 1M output", () => {
    const cost = estimateCostUsd(MODEL_SONNET, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(18.0, 5); // $3 in + $15 out
  });

  test("unknown model returns 0", () => {
    expect(estimateCostUsd("unknown-model", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
  });

  test("cache tokens counted correctly for haiku", () => {
    const cost = estimateCostUsd(MODEL_HAIKU, {
      inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 1_000_000, cacheCreateTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.10 + 1.25, 5); // $0.10 read + $1.25 write
  });
});
