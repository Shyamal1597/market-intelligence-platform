import { describe, test, expect } from "vitest";
import { validateClaim, buildExtractPrompt } from "./extractClaims";
import { loadRegistry } from "./registry";

describe("extractClaims helpers", () => {
  test("validateClaim accepts a valid claim", () => {
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
        targetText: "next quarter",
        confidence: "high",
        conditional: null,
        speaker: null,
      },
      reg,
    );
    expect(result.valid).toBe(true);
  });

  test("validateClaim rejects claim with unknown metricKey", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim(
      {
        metricKey: "nope",
        quote: "some quote",
        direction: "value",
        value: 4.2,
        rangeMin: null,
        rangeMax: null,
        qualitativeText: null,
        targetQuarter: null,
        targetText: "",
        confidence: "high",
        conditional: null,
        speaker: null,
      },
      reg,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unknown metricKey/);
  });

  test("validateClaim rejects claim with missing quote", () => {
    const reg = loadRegistry("bank");
    const result = validateClaim({ metricKey: "nim", quote: "", direction: "value" }, reg);
    expect(result.valid).toBe(false);
  });

  test("buildExtractPrompt embeds symbol and quarter in user message", () => {
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

  test("buildExtractPrompt insurance-holding registry includes consol_revenue", () => {
    const reg = loadRegistry("insurance-holding");
    const { user } = buildExtractPrompt({
      symbol: "BAJAJFINSV", quarter: "Q1-FY26", registry: reg,
      transcript: "...",
    });
    expect(user).toContain("consol_revenue");
  });
});
