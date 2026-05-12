import { describe, test, expect } from "vitest";
import { validateClaim, buildExtractPrompt, deduplicateClaims } from "./extractClaims";
import { loadRegistry } from "./registry";

describe("validateClaim", () => {
  test("accepts a valid claim", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      {
        metricKey: "nim",
        quote: "We expect NIM to be around 4% next quarter",
        direction: "value",
        value: 4.0,
        rangeMin: null,
        rangeMax: null,
        qualitativeText: null,
        targetQuarter: "Q1-FY27",
        targetText: "~4% next quarter",
        confidence: "high",
        conditional: null,
        speaker: null,
      },
      reg,
    );
    expect(result.valid).toBe(true);
  });

  test("rejects unknown metricKey", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      { metricKey: "nope", quote: "some quote", direction: "value", targetText: "next quarter" },
      reg,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unknown metricKey/);
  });

  test("rejects missing quote", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      { metricKey: "nim", quote: "", direction: "value", targetText: "stable next quarter" },
      reg,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/quote/);
  });

  test("rejects empty targetText", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      { metricKey: "nim", quote: "NIM will improve", direction: "up", targetText: "" },
      reg,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/targetText/);
  });

  test("rejects missing targetText", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      { metricKey: "nim", quote: "NIM will improve", direction: "up" },
      reg,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/targetText/);
  });
});

describe("deduplicateClaims", () => {
  test("keeps single claim unchanged", () => {
    const claims = [
      { metricKey: "nim", targetQuarter: "Q2-FY26", direction: "up" as const, confidence: "medium" as const },
    ];
    expect(deduplicateClaims(claims)).toHaveLength(1);
  });

  test("deduplicates same metric × target quarter, keeps most specific", () => {
    const claims = [
      { metricKey: "nim", targetQuarter: "Q2-FY26", direction: "up"    as const, confidence: "low"    as const },
      { metricKey: "nim", targetQuarter: "Q2-FY26", direction: "value" as const, confidence: "high"   as const, value: 3.5 },
      { metricKey: "nim", targetQuarter: "Q2-FY26", direction: "up"    as const, confidence: "medium" as const },
    ];
    const result = deduplicateClaims(claims);
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("value");
    expect(result[0].value).toBe(3.5);
  });

  test("keeps distinct metric × target quarter combinations", () => {
    const claims = [
      { metricKey: "nim",         targetQuarter: "Q2-FY26", direction: "up" as const },
      { metricKey: "advance_growth", targetQuarter: "Q2-FY26", direction: "up" as const },
      { metricKey: "nim",         targetQuarter: "Q3-FY26", direction: "up" as const },
    ];
    expect(deduplicateClaims(claims)).toHaveLength(3);
  });

  test("treats null targetQuarter as its own bucket", () => {
    const claims = [
      { metricKey: "nim", targetQuarter: null, direction: "up"    as const, confidence: "low"    as const },
      { metricKey: "nim", targetQuarter: null, direction: "value" as const, confidence: "high"   as const, value: 3.8 },
    ];
    const result = deduplicateClaims(claims);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(3.8);
  });
});

describe("buildExtractPrompt", () => {
  test("embeds symbol and source quarter", () => {
    const reg = loadRegistry("bank");
    const { system, user } = buildExtractPrompt({
      symbol: "HDFCBANK",
      quarter: "Q3-FY26",
      registry: reg,
      transcript: "Management said NIM will improve next quarter.",
    });
    expect(system).toContain("research analyst");
    expect(user).toContain("HDFCBANK");
    expect(user).toContain("Q3-FY26");
    expect(user).toContain('"key": "nim"');
  });

  test("instructs LLM to reject current-quarter facts", () => {
    const { system } = buildExtractPrompt({
      symbol: "HDFCBANK", quarter: "Q3-FY26",
      registry: loadRegistry("bank"),
      transcript: "",
    });
    expect(system).toMatch(/current.quarter|already happened/i);
  });

  test("instructs LLM to reject vague sentiment", () => {
    const { system } = buildExtractPrompt({
      symbol: "HDFCBANK", quarter: "Q3-FY26",
      registry: loadRegistry("bank"),
      transcript: "",
    });
    expect(system).toMatch(/confident|optimis|well.positioned/i);
  });

  test("instructs LLM that value is a future target, not a reported actual", () => {
    const { system } = buildExtractPrompt({
      symbol: "HDFCBANK", quarter: "Q3-FY26",
      registry: loadRegistry("bank"),
      transcript: "",
    });
    expect(system).toMatch(/future target|DO NOT use.*reported/i);
  });

  test("insurance-holding registry includes new bfl_pat and bfl_roa", () => {
    const reg = loadRegistry("insurance-holding");
    const { user } = buildExtractPrompt({
      symbol: "BAJAJFINSV", quarter: "Q1-FY26", registry: reg,
      transcript: "...",
    });
    expect(user).toContain("bfl_pat");
    expect(user).toContain("bfl_roa");
    expect(user).toContain("bagic_roe");
    expect(user).toContain("balic_pat");
  });

  test("bank registry includes cd_ratio and lcr", () => {
    const reg = loadRegistry("bank");
    const { user } = buildExtractPrompt({
      symbol: "HDFCBANK", quarter: "Q1-FY26", registry: reg,
      transcript: "...",
    });
    expect(user).toContain("cd_ratio");
    expect(user).toContain("lcr");
    expect(user).toContain("contingent_provisions");
  });
});
