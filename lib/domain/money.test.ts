import { describe, expect, it } from "vitest";
import { formatAmount, fromUnits, splitAmount, splitEvenly, toUnits } from "./money";

describe("money", () => {
  it("converts NIM (5 decimals) and USDT (6 decimals)", () => {
    expect(toUnits("1", "NIM")).toBe(100000n);
    expect(toUnits("12.5", "USDT")).toBe(12500000n);
    expect(fromUnits(123456n, "NIM")).toBe("1.23456");
  });

  it("splits whole and greyed decimals for display", () => {
    expect(splitAmount(123456789n, "NIM")).toEqual({ whole: "1,234", decimals: "56789" });
    expect(splitAmount(5000000n, "USDT")).toEqual({ whole: "5", decimals: "00" });
    expect(formatAmount(150000n, "NIM")).toMatch(/^1\.50 NIM$/);
  });

  it("spreads the remainder so shares add up exactly", () => {
    const parts = splitEvenly(100n, 3);
    expect(parts).toEqual([34n, 33n, 33n]);
    expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(100n);
  });
});
