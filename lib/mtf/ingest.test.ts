import { describe, test, expect } from "vitest";
import { detectAmtFinancedUnitFactor, parseMoverDate } from "./ingest";

describe("detectAmtFinancedUnitFactor", () => {
  test("recognizes the real current header text as Lakhs (factor 1)", () => {
    // Verbatim header from a real sample file (MARGIN TRADING VOLUME WISE
    // REPORT 20.07.2026.xls, "MTF TRADING" sheet, column D).
    const result = detectAmtFinancedUnitFactor("Amt Fin by all the members(Rs. In Lakhs)");
    expect(result).toEqual({ factor: 1, label: "Lakhs" });
  });

  test("recognizes a Cr-labeled header (factor 100)", () => {
    const result = detectAmtFinancedUnitFactor("Amt Fin by all the members(Rs. In Cr)");
    expect(result).toEqual({ factor: 100, label: "Crores" });
  });

  test("recognizes a Crore-labeled header (factor 100)", () => {
    const result = detectAmtFinancedUnitFactor("Amt Financed (Rs. In Crores)");
    expect(result).toEqual({ factor: 100, label: "Crores" });
  });

  test("is case-insensitive", () => {
    expect(detectAmtFinancedUnitFactor("AMT FIN (RS. IN LAKHS)")).toEqual({ factor: 1, label: "Lakhs" });
    expect(detectAmtFinancedUnitFactor("amt fin (rs. in cr)")).toEqual({ factor: 100, label: "Crores" });
  });

  test("throws rather than guessing when the header doesn't mention a unit", () => {
    expect(() => detectAmtFinancedUnitFactor("Amt Fin by all the members")).toThrow(
      /Cannot determine the unit/,
    );
  });

  test("throws on an empty header", () => {
    expect(() => detectAmtFinancedUnitFactor("")).toThrow(/Cannot determine the unit/);
  });
});

describe("parseMoverDate", () => {
  test("parses the dotted DD.MM.YYYY format used by every file through 2026-07-30", () => {
    expect(parseMoverDate("09.06.2026")).toBe("2026-06-09");
    expect(parseMoverDate("30.07.2026")).toBe("2026-07-30");
  });

  test("parses the dash Mon format used from 2026-08-03 onward, with leading space", () => {
    expect(parseMoverDate(" 03-Aug-2026")).toBe("2026-08-03");
    expect(parseMoverDate("03-Aug-2026")).toBe("2026-08-03");
  });

  test("is case-insensitive on the month abbreviation", () => {
    expect(parseMoverDate("03-AUG-2026")).toBe("2026-08-03");
    expect(parseMoverDate("03-aug-2026")).toBe("2026-08-03");
  });

  test("returns null for unrecognized formats rather than guessing", () => {
    expect(parseMoverDate("2026-08-03")).toBeNull();
    expect(parseMoverDate("")).toBeNull();
    expect(parseMoverDate(null)).toBeNull();
    expect(parseMoverDate(undefined)).toBeNull();
    expect(parseMoverDate("Symbol")).toBeNull();
  });
});
