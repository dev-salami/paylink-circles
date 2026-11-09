import { encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";
import { ERC20_ABI, EVM_CHAINS, evmAddChainParam, selectEvmPayer, verifyUsdtReceipt, type EvmReceipt } from "./evm";

const TOKEN = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

function receipt(value: bigint, from = PAYER, to = RECIPIENT, status = "0x1"): EvmReceipt {
  const topics = encodeEventTopics({ abi: ERC20_ABI, eventName: "Transfer", args: { from: from as `0x${string}`, to: to as `0x${string}` } });
  return { status, from, to: TOKEN, blockNumber: "0x10", logs: [{ address: TOKEN.toLowerCase(), topics: topics as string[], data: encodeAbiParameters([{ type: "uint256" }], [value]) }] };
}

describe("verifyUsdtReceipt", () => {
  const expectation = { token: TOKEN as `0x${string}`, recipient: RECIPIENT, minValue: 5_000_000n, payer: PAYER };

  it("accepts a Transfer of at least the share to the recipient", () => {
    expect(verifyUsdtReceipt(receipt(5_000_000n), expectation)).toMatchObject({ ok: true, value: 5_000_000n, blockNumber: 16 });
  });

  it("rejects short, reverted, wrong-payer or wrong-recipient transfers", () => {
    expect(verifyUsdtReceipt(receipt(4_999_999n), expectation)).toMatchObject({ ok: false });
    expect(verifyUsdtReceipt(receipt(5_000_000n, PAYER, RECIPIENT, "0x0"), expectation)).toMatchObject({ ok: false, reason: "Transaction reverted" });
    expect(verifyUsdtReceipt(receipt(5_000_000n, RECIPIENT, RECIPIENT), expectation)).toMatchObject({ ok: false, reason: expect.stringMatching(/different wallet/) });
    expect(verifyUsdtReceipt(receipt(5_000_000n, PAYER, PAYER), expectation)).toMatchObject({ ok: false });
  });

  it("waits while not mined", () => {
    expect(verifyUsdtReceipt(null, expectation)).toMatchObject({ ok: false, retry: true });
    expect(verifyUsdtReceipt({ ...receipt(5_000_000n), status: null }, expectation)).toMatchObject({ ok: false, retry: true });
  });

  it("accepts status 0x01 and a later matching transfer", () => {
    const short = receipt(1n);
    const full = receipt(5_000_000n);
    const combined: EvmReceipt = { ...full, status: "0x01", logs: [...(short.logs ?? []), ...(full.logs ?? [])] };
    expect(verifyUsdtReceipt(combined, expectation)).toMatchObject({ ok: true, value: 5_000_000n });
    expect(verifyUsdtReceipt({ ...receipt(5_000_000n), status: 1 }, expectation)).toMatchObject({ ok: true });
  });

  it("does not pay from a different EVM account", () => {
    expect(selectEvmPayer(["0xabc"], "0xdef")).toMatchObject({ ok: false });
    expect(selectEvmPayer(["0xAbC"], "0xabc")).toMatchObject({ ok: true, from: "0xAbC" });
    expect(selectEvmPayer([])).toMatchObject({ ok: false });
  });

  it("describes Polygon for wallet_addEthereumChain without swapping the USDT contract", () => {
    const param = evmAddChainParam(EVM_CHAINS.polygon);
    expect(param.chainId).toBe("0x89");
    expect(param.nativeCurrency.symbol).toBe("POL");
    expect(param.rpcUrls[0]).toContain("polygon");
    expect(param.blockExplorerUrls[0]).toBe("https://polygonscan.com");
    expect(JSON.stringify(param)).not.toContain(EVM_CHAINS.polygon.usdt);
  });
});
