import { describe, test, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { findRow, buildQuarterIndex } from "./parseExcel";

const FIXTURE = path.join(__dirname, "__fixtures__", "tiny.xlsx");

beforeAll(() => {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const data = [
    [],
    ["", "Ticker", "TEST IN", "", "Accounting"],
    [],
    ["", "Q", "-3Q", "-2Q", "-1Q", "-0Q"],
    ["", "Income Statement", "FQ1 2025", "FQ2 2025", "FQ3 2025", "FQ4 2025"],
    ["", "", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31"],
    ["SALES_REV/10^6", "Revenue", 100, 200, 300, 400],
    ["NIM", "Net Interest Margin", 4.1, 4.2, 4.15, 4.3],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
  XLSX.writeFile(wb, FIXTURE);
});

describe("parseExcel scanners", () => {
  test("findRow matches by case-insensitive substring", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    const hit = findRow(ws, ["net interest margin"]);
    expect(hit).not.toBeNull();
    expect(hit!.label).toMatch(/net interest margin/i);
  });

  test("findRow returns null when no match", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    expect(findRow(ws, ["does not exist"])).toBeNull();
  });

  test("buildQuarterIndex maps date columns to quarter labels", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    const idx = buildQuarterIndex(ws);
    expect(idx).toMatchObject({
      "Q1-FY25": expect.any(Number),
      "Q2-FY25": expect.any(Number),
      "Q3-FY25": expect.any(Number),
      "Q4-FY25": expect.any(Number),
    });
  });
});
