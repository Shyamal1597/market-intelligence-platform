import { describe, test, expect } from "vitest";
import { ruleBasedCheck, buildCrossCheckPrompt } from "./crossCheck";

// ── ruleBasedCheck ────────────────────────────────────────────────────────────
const baseItem = {
  claimId: "TEST-Q1-FY26-c1",
  metricKey: "nim",
  metricLabel: "Net Interest Margin",
  metricUnit: "%" as const,
  quote: "We expect NIM around 4%",
  targetText: "next quarter",
  resolvedTargetQuarter: "Q2-FY26",
  qualitativeText: null,
  conditional: null,
  rangeMin: null,
  rangeMax: null,
};

describe("ruleBasedCheck — value direction", () => {
  test("hit within 10%", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "value", value: 4.0, actualValue: 4.1, sourceQuarterValue: 3.9 });
    expect(r?.status).toBe("hit");
  });

  test("partial within 25%", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "value", value: 4.0, actualValue: 4.6, sourceQuarterValue: 3.9 });
    expect(r?.status).toBe("partial");
  });

  test("miss beyond 25%", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "value", value: 4.0, actualValue: 2.5, sourceQuarterValue: 3.9 });
    expect(r?.status).toBe("miss");
  });

  test("no-data when actualValue is null", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "value", value: 4.0, actualValue: null, sourceQuarterValue: null });
    expect(r?.status).toBe("no-data");
  });
});

describe("ruleBasedCheck — range direction", () => {
  test("hit within range", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "range", value: null, rangeMin: 3.8, rangeMax: 4.2, actualValue: 4.0, sourceQuarterValue: null });
    expect(r?.status).toBe("hit");
  });

  test("partial near range boundary", () => {
    // 4.4 is just outside 4.2 but within 10% extension
    const r = ruleBasedCheck({ ...baseItem, direction: "range", value: null, rangeMin: 3.8, rangeMax: 4.2, actualValue: 4.4, sourceQuarterValue: null });
    expect(r?.status).toBe("partial");
  });

  test("miss well outside range", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "range", value: null, rangeMin: 3.8, rangeMax: 4.2, actualValue: 5.5, sourceQuarterValue: null });
    expect(r?.status).toBe("miss");
  });
});

describe("ruleBasedCheck — directional", () => {
  test("up: hit when actual > source", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "up", value: null, actualValue: 4.5, sourceQuarterValue: 4.0 });
    expect(r?.status).toBe("hit");
  });

  test("up: miss when actual clearly < source", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "up", value: null, actualValue: 3.5, sourceQuarterValue: 4.0 });
    expect(r?.status).toBe("miss");
  });

  test("down: hit when actual < source", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "down", value: null, actualValue: 1.2, sourceQuarterValue: 1.5 });
    expect(r?.status).toBe("hit");
  });

  test("stable: hit within 5%", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "stable", value: null, actualValue: 4.1, sourceQuarterValue: 4.0 });
    expect(r?.status).toBe("hit");
  });

  test("stable: partial within 10%", () => {
    const r = ruleBasedCheck({ ...baseItem, direction: "stable", value: null, actualValue: 4.35, sourceQuarterValue: 4.0 });
    expect(r?.status).toBe("partial");
  });

  test("returns null for qualitative-only up/down/stable claims", () => {
    const r = ruleBasedCheck({
      ...baseItem,
      direction: "up",
      value: null,
      qualitativeText: "we see significant improvement",
      actualValue: 4.5,
      sourceQuarterValue: 4.0,
    });
    expect(r).toBeNull();
  });
});

// ── buildCrossCheckPrompt ─────────────────────────────────────────────────────
describe("buildCrossCheckPrompt", () => {
  test("system prompt contains key instruction keywords", () => {
    const { system, user } = buildCrossCheckPrompt([{
      claimId: "X",
      metricKey: "nim",
      metricLabel: "NIM",
      metricUnit: "%",
      quote: "NIM will be 4%",
      direction: "value",
      value: 4.0,
      rangeMin: null,
      rangeMax: null,
      qualitativeText: null,
      targetText: "next quarter",
      resolvedTargetQuarter: "Q3-FY26",
      actualValue: 4.1,
      sourceQuarterValue: 3.9,
      conditional: null,
    }]);
    expect(system).toContain("hit");
    expect(system).toContain("miss");
    expect(system).toContain("partial");
    expect(user).toContain("nim");
    expect(user).toContain("Q3-FY26");
  });
});
