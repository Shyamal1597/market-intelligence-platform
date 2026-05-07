import { describe, test, expect } from "vitest";
import path from "node:path";
import {
  detectQuarterFromFilename,
  detectDateFromHeader,
  dateToQuarterLabel,
  reportingQuarterFromCallDate,
  extractPdfText,
  stripCoverLetter,
  stripRepeatingFooters,
} from "./transcripts";

describe("transcript detection", () => {
  test("filename Q3-FY26", () => {
    expect(detectQuarterFromFilename("Earnings Call Transcript Q3-FY26.pdf")).toBe("Q3-FY26");
  });
  test("filename Q1 - FY25 (with spaces)", () => {
    expect(detectQuarterFromFilename("Earnings Call Transcript Q1 - FY25  .pdf")).toBe("Q1-FY25");
  });
  test("filename without quarter returns null", () => {
    expect(detectQuarterFromFilename("145964f9-uuid.pdf")).toBeNull();
  });
  test("header date 'July 19, 2025' → ISO date", () => {
    expect(detectDateFromHeader("HDFC Bank Limited / July 19, 2025 / Q1 FY26 Earnings")).toBe("2025-07-19");
  });
  test("dateToQuarterLabel July 2025 → Q2-FY26", () => {
    expect(dateToQuarterLabel("2025-07-19")).toBe("Q2-FY26");
  });
});

describe("reporting quarter heuristic", () => {
  test("call on Jul 19 2025 → Q1-FY26 (Apr-Jun 2025) results", () => {
    expect(reportingQuarterFromCallDate("2025-07-19")).toBe("Q1-FY26");
  });
  test("call on Apr 18 2026 → Q4-FY26 results", () => {
    expect(reportingQuarterFromCallDate("2026-04-18")).toBe("Q4-FY26");
  });
  test("call on Feb 5 2026 → Q3-FY26 results", () => {
    expect(reportingQuarterFromCallDate("2026-02-05")).toBe("Q3-FY26");
  });
});

describe("transcript cleaning", () => {
  test("stripCoverLetter removes regulatory preamble", () => {
    const sample = `CIN: L65920MH1994PLC080618\nRef. No. SE/2025-26/177\nApril 24, 2026\n\n[boilerplate]\n\nModerator: Ladies and Gentlemen, welcome...`;
    const out = stripCoverLetter(sample);
    expect(out.startsWith("Moderator")).toBe(true);
  });

  test("stripRepeatingFooters removes Page N of M style lines", () => {
    const sample = "First line\nPage 1 of 12\nSecond line\nPage 2 of 12\nThird\nPage 3 of 12\nFourth\nPage 4 of 12";
    const out = stripRepeatingFooters(sample);
    expect(out).not.toMatch(/Page \d+ of 12/);
    expect(out).toContain("First line");
  });
});

describe("extractPdfText", () => {
  test("extracts a real Bajaj Finserv transcript", async () => {
    const p = path.join(process.cwd(), "Concall Data", "Earnings Call Transcript Q1-FY26.pdf");
    const { text, method } = await extractPdfText(p);
    expect(text.length).toBeGreaterThan(5000);
    expect(text.toLowerCase()).toContain("bajaj");
    expect(["pdf2json", "pdfminer"]).toContain(method);
  }, 60_000);
});
