import { describe, expect, it } from "vitest";
import { createShareCode, hexToUtf8, memoFor, parseMemo } from "./memo";

describe("memo", () => {
  it("creates 8-char unambiguous codes", () => {
    const code = createShareCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("round-trips through a memo and stays within 64 bytes", () => {
    const memo = memoFor("ABCD2345", "Dinner at Yellow Chilli with the whole team after the long week 🎉");
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(64);
    expect(parseMemo(memo)).toBe("ABCD2345");
    expect(parseMemo("hello")).toBeNull();
  });

  it("decodes recipientData hex", () => {
    const hex = Buffer.from("PayLink ABCD2345 Rent").toString("hex");
    expect(parseMemo(hexToUtf8(hex))).toBe("ABCD2345");
    expect(hexToUtf8("zz")).toBe("");
  });
});
