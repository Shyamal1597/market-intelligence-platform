import { describe, test, expect } from "vitest";
import { resolveTargetQuarter, resolveClaimTarget } from "./targetResolver";

const SRC = "Q2-FY26"; // source quarter used in most tests

describe("resolveTargetQuarter", () => {
  // ── Exact canonical forms ──────────────────────────────────────────────────
  test("parses 'Q3-FY27' exactly", () => {
    const r = resolveTargetQuarter("Q3-FY27", SRC);
    expect(r.quarter).toBe("Q3-FY27");
    expect(r.confidence).toBe("exact");
  });

  test("parses 'Q3 FY27' with space", () => {
    expect(resolveTargetQuarter("Q3 FY27", SRC).quarter).toBe("Q3-FY27");
  });

  test("parses 'Q3 of FY27'", () => {
    expect(resolveTargetQuarter("Q3 of FY27", SRC).quarter).toBe("Q3-FY27");
  });

  test("parses 4-digit FY: 'Q1-FY2027'", () => {
    expect(resolveTargetQuarter("Q1-FY2027", SRC).quarter).toBe("Q1-FY27");
  });

  // ── Relative quarter references ────────────────────────────────────────────
  test("'this quarter' → source quarter", () => {
    expect(resolveTargetQuarter("this quarter", SRC).quarter).toBe(SRC);
    expect(resolveTargetQuarter("current quarter", SRC).quarter).toBe(SRC);
  });

  test("'next quarter' → +1", () => {
    expect(resolveTargetQuarter("next quarter", SRC).quarter).toBe("Q3-FY26");
  });

  test("'next quarter' wraps fiscal year correctly", () => {
    // Q4-FY26 + 1 → Q1-FY27
    expect(resolveTargetQuarter("next quarter", "Q4-FY26").quarter).toBe("Q1-FY27");
  });

  // ── Half-year ──────────────────────────────────────────────────────────────
  test("'H1 FY27' → Q2-FY27", () => {
    expect(resolveTargetQuarter("H1 FY27", SRC).quarter).toBe("Q2-FY27");
  });

  test("'H2 FY27' → Q4-FY27", () => {
    expect(resolveTargetQuarter("H2 FY27", SRC).quarter).toBe("Q4-FY27");
  });

  test("'second half of FY26' → Q4-FY26", () => {
    expect(resolveTargetQuarter("second half of FY26", SRC).quarter).toBe("Q4-FY26");
  });

  // ── Full fiscal year ───────────────────────────────────────────────────────
  test("'FY27' → Q4-FY27 (end of year)", () => {
    const r = resolveTargetQuarter("FY27", SRC);
    expect(r.quarter).toBe("Q4-FY27");
    expect(r.confidence).toBe("inferred");
  });

  test("'by end of FY27' → Q4-FY27", () => {
    expect(resolveTargetQuarter("by end of FY27", SRC).quarter).toBe("Q4-FY27");
  });

  test("'full year FY27' → Q4-FY27", () => {
    expect(resolveTargetQuarter("full year FY27", SRC).quarter).toBe("Q4-FY27");
  });

  // ── Numeric quarter ranges ─────────────────────────────────────────────────
  test("'2–3 quarters' → midpoint +2 from source", () => {
    // midpoint of [2,3] = floor(2.5) = 2
    expect(resolveTargetQuarter("2–3 quarters", SRC).quarter).toBe("Q4-FY26");
    expect(resolveTargetQuarter("2-3 quarters", SRC).quarter).toBe("Q4-FY26");
  });

  test("'in 4 quarters' → +4", () => {
    expect(resolveTargetQuarter("in 4 quarters", SRC).quarter).toBe("Q2-FY27");
  });

  test("'in two quarters' → +2", () => {
    expect(resolveTargetQuarter("in two quarters", SRC).quarter).toBe("Q4-FY26");
  });

  // ── Qualitative horizons ───────────────────────────────────────────────────
  test("'near term' → +1 quarter", () => {
    expect(resolveTargetQuarter("near term", SRC).quarter).toBe("Q3-FY26");
  });

  test("'short-term' → +1 quarter", () => {
    expect(resolveTargetQuarter("short-term", SRC).quarter).toBe("Q3-FY26");
  });

  test("'medium term' → +4 quarters", () => {
    expect(resolveTargetQuarter("medium term", SRC).quarter).toBe("Q2-FY27");
  });

  test("'over the next year' → +4 quarters", () => {
    expect(resolveTargetQuarter("over the next year", SRC).quarter).toBe("Q2-FY27");
  });

  // ── Null / unrecognised ────────────────────────────────────────────────────
  test("null input → null quarter", () => {
    expect(resolveTargetQuarter(null, SRC).quarter).toBeNull();
  });

  test("empty string → null quarter", () => {
    expect(resolveTargetQuarter("", SRC).quarter).toBeNull();
  });

  test("unrecognised text → null quarter", () => {
    expect(resolveTargetQuarter("when conditions improve", SRC).quarter).toBeNull();
  });
});

describe("resolveClaimTarget", () => {
  test("honours canonical targetQuarter when valid", () => {
    const r = resolveClaimTarget("Q3-FY27", "next quarter", SRC);
    expect(r.quarter).toBe("Q3-FY27");
    expect(r.confidence).toBe("exact");
  });

  test("falls back to targetText when targetQuarter is null", () => {
    const r = resolveClaimTarget(null, "H2 FY27", SRC);
    expect(r.quarter).toBe("Q4-FY27");
  });

  test("falls back to targetText when targetQuarter is unparseable", () => {
    const r = resolveClaimTarget("some garbage", "next quarter", SRC);
    expect(r.quarter).toBe("Q3-FY26");
  });

  test("returns null when both are missing", () => {
    expect(resolveClaimTarget(null, null, SRC).quarter).toBeNull();
  });

  test("ignores targetQuarter when it equals sourceQuarter — uses targetText instead", () => {
    // LLM sometimes sets targetQuarter = sourceQuarter even when targetText = "next quarter"
    const r = resolveClaimTarget(SRC, "next quarter", SRC);
    expect(r.quarter).toBe("Q3-FY26"); // sourceQuarter (Q2-FY26) + 1
  });

  test("still resolves to sourceQuarter when targetText says 'this quarter'", () => {
    // Even though we don't trust targetQuarter = sourceQuarter, targetText resolution
    // should still correctly return sourceQuarter for "this quarter"
    const r = resolveClaimTarget(SRC, "this quarter", SRC);
    expect(r.quarter).toBe(SRC);
  });
});
