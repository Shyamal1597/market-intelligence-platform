import { describe, test, expect } from "vitest";
import { curateForPdf } from "./curate";
import type {
  SectorBreakdownRow, ContinuousFunderRow, DivergenceRow, HeatmapNode,
} from "../queries";

function sector(sector: string, amtToday: number): SectorBreakdownRow {
  return { sector, amtToday, amtYesterday: amtToday, amtChangePct: 0, symbolCount: 1 };
}
function funder(symbol: string, cont: number): ContinuousFunderRow {
  return { symbol, name: null, cont, amtChangePct: 1, priceChangePct: 1, amtToday: 100, sparkline: [] };
}
function divergent(symbol: string, amtChangePct: number): DivergenceRow {
  return {
    symbol, name: null, amtChangePct, priceChangePct: -amtChangePct, amtToday: 100,
    pattern: "leverage-up-price-down",
  };
}
function node(symbol: string, amtToday: number): HeatmapNode {
  return { symbol, name: null, amtToday, amtChangePct: 1, priceChangePct: 1, turnoverLakhs: 1000 };
}

describe("curateForPdf", () => {
  test("trims sector breakdown to top 10 by book size, preserves sort order", () => {
    const rows = Array.from({ length: 15 }, (_, i) => sector(`S${i}`, 15 - i));
    const out = curateForPdf.sectors(rows);
    expect(out).toHaveLength(10);
    expect(out[0].sector).toBe("S0");
    expect(out[9].sector).toBe("S9");
  });

  test("trims continuous funders to top 100", () => {
    const rows = Array.from({ length: 150 }, (_, i) => funder(`SYM${i}`, 5));
    expect(curateForPdf.continuousFunders(rows)).toHaveLength(100);
  });

  test("continuous funders passes through shorter lists unchanged (fewer than 100 persistent movers on a given day)", () => {
    const rows = Array.from({ length: 79 }, (_, i) => funder(`SYM${i}`, 4));
    expect(curateForPdf.continuousFunders(rows)).toHaveLength(79);
  });

  test("trims divergence to top 12", () => {
    const rows = Array.from({ length: 20 }, (_, i) => divergent(`SYM${i}`, 10 + i));
    expect(curateForPdf.divergence(rows)).toHaveLength(12);
  });

  test("trims top movers (heatmap nodes) to top 15", () => {
    const rows = Array.from({ length: 20 }, (_, i) => node(`SYM${i}`, 100 - i));
    expect(curateForPdf.topMovers(rows)).toHaveLength(15);
  });

  test("passes through short lists unchanged", () => {
    const rows = [sector("Banks", 100)];
    expect(curateForPdf.sectors(rows)).toEqual(rows);
  });
});
