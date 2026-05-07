import { describe, test, expect } from "vitest";
import { dateToQuarter, bloombergFqToQuarter, normalizeQuarter, quarterAddOffset } from "./quarters";

describe("quarter helpers", () => {
  test("dateToQuarter: 2025-12-31 → Q3-FY26 (Indian FY)", () => {
    expect(dateToQuarter("2025-12-31")).toBe("Q3-FY26");
  });
  test("dateToQuarter: 2025-03-31 → Q4-FY25", () => {
    expect(dateToQuarter("2025-03-31")).toBe("Q4-FY25");
  });
  test("dateToQuarter: 2025-06-30 → Q1-FY26", () => {
    expect(dateToQuarter("2025-06-30")).toBe("Q1-FY26");
  });
  test("dateToQuarter: 2025-09-30 → Q2-FY26", () => {
    expect(dateToQuarter("2025-09-30")).toBe("Q2-FY26");
  });

  test("bloombergFqToQuarter: 'FQ3 2026' → Q3-FY26", () => {
    expect(bloombergFqToQuarter("FQ3 2026")).toBe("Q3-FY26");
  });

  test("normalizeQuarter accepts Q3-FY26", () => {
    expect(normalizeQuarter("Q3-FY26")).toBe("Q3-FY26");
  });
  test("normalizeQuarter accepts 'Q3 FY26'", () => {
    expect(normalizeQuarter("Q3 FY26")).toBe("Q3-FY26");
  });

  test("quarterAddOffset: Q3-FY26 + 1 = Q4-FY26", () => {
    expect(quarterAddOffset("Q3-FY26", 1)).toBe("Q4-FY26");
  });
  test("quarterAddOffset: Q4-FY26 + 1 = Q1-FY27", () => {
    expect(quarterAddOffset("Q4-FY26", 1)).toBe("Q1-FY27");
  });
  test("quarterAddOffset: Q1-FY26 - 1 = Q4-FY25", () => {
    expect(quarterAddOffset("Q1-FY26", -1)).toBe("Q4-FY25");
  });
});
