import { describe, test, expect } from "vitest";
import { buildCrossCheckPrompt } from "./crossCheck";

const sampleClaim = {
  claimId: "HDFCBANK-Q1-FY26-c1",
  metricLabel: "Net Interest Margin",
  metricUnit: "%",
  managementStatement: "We expect NIM to expand to ~4% over the next quarter",
  direction: "value",
  value: 4.0,
  rangeMin: null,
  rangeMax: null,
  qualitativeText: null,
  targetText: "next quarter",
  conditional: null,
};

describe("buildCrossCheckPrompt", () => {
  const brief = "Company: HDFCBANK\nSegments and metrics being tracked:\n  - Banking: Net Interest Margin";

  test("system prompt contains verdict definitions", () => {
    const { system } = buildCrossCheckPrompt(
      "Q1-FY26",
      "Q2-FY26",
      [sampleClaim],
      "NIM for Q2 came in at 3.97%...",
      brief,
    );
    expect(system).toContain("met");
    expect(system).toContain("moving");
    expect(system).toContain("miss");
    expect(system).toContain("ambiguous");
  });

  test("user prompt contains source and target quarter", () => {
    const { user } = buildCrossCheckPrompt(
      "Q1-FY26",
      "Q2-FY26",
      [sampleClaim],
      "NIM for Q2 came in at 3.97%...",
      brief,
    );
    expect(user).toContain("Q1-FY26");
    expect(user).toContain("Q2-FY26");
  });

  test("user prompt contains claim ID and metric", () => {
    const { user } = buildCrossCheckPrompt(
      "Q1-FY26",
      "Q2-FY26",
      [sampleClaim],
      "NIM for Q2 came in at 3.97%...",
      brief,
    );
    expect(user).toContain("HDFCBANK-Q1-FY26-c1");
    expect(user).toContain("Net Interest Margin");
  });

  test("user prompt contains the transcript text", () => {
    const transcript = "NIM for the quarter stood at 3.97%, slightly below our guided 4%.";
    const { user } = buildCrossCheckPrompt("Q1-FY26", "Q2-FY26", [sampleClaim], transcript, brief);
    expect(user).toContain(transcript);
  });

  test("output schema is described in system prompt", () => {
    const { system } = buildCrossCheckPrompt("Q1-FY26", "Q2-FY26", [sampleClaim], "...", brief);
    expect(system).toContain("claimId");
    expect(system).toContain("verdict");
    expect(system).toContain("actualText");
    expect(system).toContain("reasoning");
  });
});
