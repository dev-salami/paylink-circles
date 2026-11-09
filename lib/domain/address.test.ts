import { describe, expect, it } from "vitest";
import { isValidEvmAddress, isValidNimiqAddress, normalizeNimiqAddress, sameEvmAddress, sameNimiqAddress, shortAddress } from "./address";

// Real testnet addresses generated with @nimiq/core.
const A = "NQ34 8B9Y 9C0H 57LY 35PH 8LYV 93CV 4SMV JXCQ";
const B = "NQ44 TB60 XH8G 5FNA 4EQL KYXH PGSY P9LX 3NUY";

describe("nimiq addresses", () => {
  it("accepts valid addresses in any spacing or case", () => {
    expect(isValidNimiqAddress(A)).toBe(true);
    expect(isValidNimiqAddress(B.replace(/\s/g, "").toLowerCase())).toBe(true);
    expect(normalizeNimiqAddress(B.replace(/\s/g, ""))).toBe(B);
  });

  it("rejects a bad checksum", () => {
    expect(isValidNimiqAddress(A.replace("NQ34", "NQ35"))).toBe(false);
    expect(isValidNimiqAddress("NQ00 0000")).toBe(false);
  });

  it("compares and shortens", () => {
    expect(sameNimiqAddress(A, A.replace(/\s/g, ""))).toBe(true);
    expect(sameNimiqAddress(A, B)).toBe(false);
    expect(shortAddress(A)).toContain("…");
  });
});

describe("evm addresses", () => {
  it("validates and compares case-insensitively", () => {
    expect(isValidEvmAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F")).toBe(true);
    expect(isValidEvmAddress("0x123")).toBe(false);
    expect(sameEvmAddress("0xABCDEF0000000000000000000000000000000001", "0xabcdef0000000000000000000000000000000001")).toBe(true);
  });
});
