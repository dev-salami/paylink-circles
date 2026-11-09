import { describe, expect, it } from "vitest";
import { NimiqRpc, verifyNimiqTransaction, type NimiqRpcTransaction } from "./nimiq";

const TO = "NQ93 4CUM HV4V A1T8 YM6Y XLB7 DCTT JM6F LJDX";
const FROM = "NQ34 8B9Y 9C0H 57LY 35PH 8LYV 93CV 4SMV JXCQ";
const memoHex = Buffer.from("PayLink ABCD2345 Dinner").toString("hex");

function tx(overrides: Partial<NimiqRpcTransaction> = {}): NimiqRpcTransaction {
  return { hash: "ab".repeat(32), blockNumber: 100, confirmations: 3, from: FROM.replace(/\s/g, ""), to: TO.replace(/\s/g, ""), value: 3333334, fee: 0, recipientData: memoHex, networkId: 5, executionResult: true, ...overrides };
}

const expectation = { network: "testnet" as const, recipient: TO, minValue: 3333334n, memoCode: "ABCD2345" };

describe("verifyNimiqTransaction", () => {
  it("accepts a matching, confirmed payment", () => {
    const result = verifyNimiqTransaction(tx(), expectation);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.from).toBe(FROM);
  });

  it("retries while not yet on chain or unconfirmed", () => {
    expect(verifyNimiqTransaction(null, expectation)).toMatchObject({ ok: false, retry: true });
    expect(verifyNimiqTransaction(tx({ confirmations: 0 }), expectation)).toMatchObject({ ok: false, retry: true });
  });

  it("rejects wrong network, recipient, amount, memo or failed execution", () => {
    expect(verifyNimiqTransaction(tx({ networkId: 24 }), expectation)).toMatchObject({ ok: false, retry: false });
    expect(verifyNimiqTransaction(tx({ to: FROM }), expectation)).toMatchObject({ ok: false, reason: expect.stringMatching(/different address/) });
    expect(verifyNimiqTransaction(tx({ value: 100 }), expectation)).toMatchObject({ ok: false, reason: expect.stringMatching(/less/) });
    expect(verifyNimiqTransaction(tx({ recipientData: "" }), expectation)).toMatchObject({ ok: false, reason: expect.stringMatching(/memo/) });
    expect(verifyNimiqTransaction(tx({ executionResult: false }), expectation)).toMatchObject({ ok: false, reason: expect.stringMatching(/failed/) });
  });
});

describe("NimiqRpc", () => {
  it("returns null for unknown transactions", async () => {
    const fake = (async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Internal error", data: "Transaction not found: abc" } }))) as typeof fetch;
    expect(await new NimiqRpc("http://rpc", fake).getTransaction("abc")).toBeNull();
  });

  it("passes three params to getTransactionsByAddress", async () => {
    let sent: unknown;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { data: [tx()] } }));
    }) as typeof fetch;
    const list = await new NimiqRpc("http://rpc", fake).getTransactionsByAddress(TO, 25);
    expect(list).toHaveLength(1);
    expect((sent as { params: unknown[] }).params).toEqual([TO, 25, null]);
  });
});
