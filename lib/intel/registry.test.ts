import { describe, test, expect } from "vitest";
import { loadRegistry, registryHash, validateRegistry } from "./registry";

describe("registry loader", () => {
  test("loads insurance-holding registry", () => {
    const r = loadRegistry("insurance-holding");
    expect(r.sector).toBe("insurance-holding");
    expect(r.metrics.length).toBeGreaterThanOrEqual(15);
    expect(r.metrics.some(m => m.key === "bagic_combined_ratio")).toBe(true);
  });

  test("loads bank registry", () => {
    const r = loadRegistry("bank");
    expect(r.sector).toBe("bank");
    expect(r.metrics.some(m => m.key === "nim")).toBe(true);
  });

  test("rejects duplicate keys within a registry", () => {
    expect(() => {
      validateRegistry({
        sector: "bank",
        metrics: [
          { key: "nim", label: "x", unit: "%", direction: "higher-is-better", segment: "x", excel: { sheet: "x", rowLabelMatch: [] }, aliases: [], description: "x" },
          { key: "nim", label: "y", unit: "%", direction: "higher-is-better", segment: "x", excel: { sheet: "x", rowLabelMatch: [] }, aliases: [], description: "y" },
        ],
      });
    }).toThrow(/duplicate/i);
  });

  test("registryHash is deterministic", () => {
    const a = registryHash(loadRegistry("bank"));
    const b = registryHash(loadRegistry("bank"));
    expect(a).toBe(b);
  });
});
