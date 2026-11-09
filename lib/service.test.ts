import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { ERC20_ABI, EVM_CHAINS, type EvmReceipt } from "./chain/evm";
import { DEFAULT_NIMIQ_RPC, type NimiqRpcTransaction } from "./chain/nimiq";
import { evmChain, evmConfigFor, nimiqNetwork, nimiqRpcUrlFor, usdtEnabled } from "./env";
import { memoFor } from "./domain/memo";
import { claimPayment, createGroup, join, payIntent, publicGroup, remind, requireGroup, syncGroup } from "./service";
import { resetStoreForTests } from "./store";

const ORG = "NQ93 4CUM HV4V A1T8 YM6Y XLB7 DCTT JM6F LJDX";
const A = "NQ34 8B9Y 9C0H 57LY 35PH 8LYV 93CV 4SMV JXCQ";
const B = "NQ44 TB60 XH8G 5FNA 4EQL KYXH PGSY P9LX 3NUY";

let dir = "";
let chain: NimiqRpcTransaction[] = [];
let evmReceipt: EvmReceipt | null = null;

function rpcFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    if (request.method === "eth_getTransactionReceipt") {
      return new Response(JSON.stringify({ result: evmReceipt }));
    }
    if (request.method === "getTransactionByHash") {
      const found = chain.find((tx) => tx.hash === request.params[0]);
      return new Response(JSON.stringify(found ? { result: { data: found } } : { error: { code: -32603, message: "Internal error", data: "Transaction not found" } }));
    }
    if (request.method === "getTransactionsByAddress") {
      const address = String(request.params[0]).replace(/\s/g, "");
      return new Response(JSON.stringify({ result: { data: chain.filter((tx) => tx.to === address) } }));
    }
    return new Response(JSON.stringify({ result: { data: 1 } }));
  });
}

function pay(from: string, to: string, value: string, memo: string, hash: string): NimiqRpcTransaction {
  const tx = { hash, blockNumber: 500, confirmations: 2, from: from.replace(/\s/g, ""), to: to.replace(/\s/g, ""), value: Number(value), fee: 0, recipientData: Buffer.from(memo).toString("hex"), networkId: 5, executionResult: true };
  chain.push(tx);
  return tx;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "circles-"));
  process.env.DATA_DIR = dir;
  process.env.NIMIQ_NETWORK = "testnet";
  resetStoreForTests();
  chain = [];
  evmReceipt = null;
  vi.stubGlobal("fetch", rpcFetch());
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NIMIQ_RPC_URL;
  delete process.env.USDT_RPC_URL;
  delete process.env.USDT_TOKEN_ADDRESS;
  delete process.env.USDT_CHAIN;
  process.env.NIMIQ_NETWORK = "testnet";
});

const now = new Date("2026-11-05T09:00:00Z");

describe("bill split end to end (stubbed chain)", () => {
  it("creates, joins, claims by hash and hides secrets", async () => {
    const created = await createGroup({ kind: "bill", title: "Suya night", asset: "NIM", amount: "30", memberNames: ["Khalil", "Ada", "Tunde"], organizer: { name: "Khalil", nimAddress: ORG, email: "k@example.com" }, date: "2026-11-08" }, now);
    const group = created.group;
    const joined = await join(group.id, { inviteCode: group.inviteCode, name: "Ada", nimAddress: A, email: "ada@example.com" }, now);
    const view = publicGroup(requireGroup(group.id), { memberToken: joined.memberToken }, now);
    expect(view.meId).toBe(joined.memberId);
    expect(view.isAdmin).toBe(false);
    expect(JSON.stringify(view)).not.toContain("ada@example.com");
    expect(JSON.stringify(view)).not.toContain("tokenHash");
    expect(publicGroup(requireGroup(group.id), {}, now).inviteCode).toBeUndefined();

    const share = requireGroup(group.id).shares.find((item) => item.memberId === joined.memberId);
    if (!share) throw new Error("no share");
    const intent = payIntent(requireGroup(group.id), share.id);
    expect(intent.recipient).toBe(ORG);
    expect(intent.memo).toBe(memoFor(share.code, "Suya night"));

    expect(await claimPayment(group.id, share.id, "cd".repeat(32), now)).toMatchObject({ status: "pending" });
    pay(A, ORG, "100", intent.memo, "ef".repeat(32));
    expect(await claimPayment(group.id, share.id, "ef".repeat(32), now)).toMatchObject({ status: "rejected" });
    pay(A, ORG, share.amount, intent.memo, "aa".repeat(32));
    const claim = await claimPayment(group.id, share.id, "aa".repeat(32), now);
    expect(claim.status).toBe("paid");
    expect(requireGroup(group.id).shares.find((item) => item.id === share.id)?.status).toBe("paid");

    // A transaction hash can only pay one share.
    const other = requireGroup(group.id).shares.find((item) => item.status === "unpaid");
    if (!other) throw new Error("no other share");
    expect(await claimPayment(group.id, other.id, "aa".repeat(32), now)).toMatchObject({ status: "rejected" });
  });

  it("only lets the organizer remind, with a cooldown", async () => {
    const { group, adminToken } = await createGroup({ kind: "bill", title: "Rent", asset: "NIM", amount: "900", memberNames: ["Khalil", "Ada"], organizer: { name: "Khalil", nimAddress: ORG }, date: "2026-11-06" }, now);
    await expect(remind(group.id, "nope", {}, now)).rejects.toThrow(/organizer/);
    const sent = await remind(group.id, adminToken, {}, now);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message).toContain(`/pay/${group.id}/`);
    expect(await remind(group.id, adminToken, {}, now)).toHaveLength(0);
  });
});

describe("ajo circle end to end (stubbed chain)", () => {
  it("routes contributions to the round collector and detects memo payments by scan", async () => {
    const { group } = await createGroup({ kind: "ajo", title: "Ajo", asset: "NIM", amount: "10", memberNames: ["Khalil", "Ada", "Bisi"], organizer: { name: "Khalil", nimAddress: ORG }, frequency: "weekly", date: "2026-11-08" }, now);
    await expect(join(group.id, { inviteCode: "WRONG", name: "x", nimAddress: A }, now)).rejects.toThrow(/invite/);
    const ada = await join(group.id, { inviteCode: group.inviteCode, name: "Ada", nimAddress: A }, now);
    await expect(join(group.id, { inviteCode: group.inviteCode, name: "Ada again", nimAddress: A }, now)).rejects.toThrow(/already joined/);

    // Round 0 goes to the organizer (slot 0); round 2's collector hasn't joined yet.
    const live = requireGroup(group.id);
    const round0 = live.shares.find((share) => share.round === 0 && share.memberId === ada.memberId);
    const round2 = live.shares.find((share) => share.round === 2 && share.memberId === ada.memberId);
    if (!round0 || !round2) throw new Error("missing shares");
    expect(() => payIntent(live, round2.id)).toThrow(/hasn't joined/);

    const intent = payIntent(live, round0.id);
    expect(intent.recipient).toBe(ORG);
    pay(A, ORG, round0.amount, intent.memo, "bb".repeat(32));
    expect(await syncGroup(group.id, now)).toEqual({ matched: 1 });
    expect(await syncGroup(group.id, now)).toEqual({ matched: 0 });
    const after = publicGroup(requireGroup(group.id), {}, now);
    expect(after.rounds[0]).toMatchObject({ paid: 2, count: 3 });

    await join(group.id, { inviteCode: group.inviteCode, name: "Bisi", nimAddress: B }, now);
    expect(payIntent(requireGroup(group.id), round2.id).recipient).toBe(B);
  });
});

const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

function usdtReceipt(value: bigint): EvmReceipt {
  const token = EVM_CHAINS.polygon.usdt;
  const topics = encodeEventTopics({ abi: ERC20_ABI, eventName: "Transfer", args: { from: PAYER as `0x${string}`, to: RECIPIENT as `0x${string}` } });
  return {
    status: "0x1",
    from: PAYER,
    to: token,
    blockNumber: "0x10",
    logs: [{ address: token.toLowerCase(), topics: topics as string[], data: encodeAbiParameters([{ type: "uint256" }], [value]) }],
  };
}

describe("network stays with the group", () => {
  it.each([undefined, "mainnet", "unexpected"])("defaults new NIM groups to mainnet for env %s", async (network) => {
    if (network === undefined) delete process.env.NIMIQ_NETWORK;
    else process.env.NIMIQ_NETWORK = network;
    expect(nimiqNetwork()).toBe("mainnet");
    const { group } = await createGroup({ kind: "bill", title: "Lunch", asset: "NIM", amount: "2", memberNames: ["Organizer", "Member"], organizer: { name: "Organizer", nimAddress: ORG }, date: "2026-11-08" }, now);
    expect(group.chain).toBe("nimiq-mainnet");
  });

  it("creates testnet NIM groups only when explicitly selected", async () => {
    process.env.NIMIQ_NETWORK = "testnet";
    expect(nimiqNetwork()).toBe("testnet");
    const { group } = await createGroup({ kind: "bill", title: "Lunch", asset: "NIM", amount: "2", memberNames: ["Organizer", "Member"], organizer: { name: "Organizer", nimAddress: ORG }, date: "2026-11-08" }, now);
    expect(group.chain).toBe("nimiq-testnet");
  });

  it.each([undefined, "mainnet"])("keeps a mainnet custom RPC away from testnet for env %s", (network) => {
    if (network === undefined) delete process.env.NIMIQ_NETWORK;
    else process.env.NIMIQ_NETWORK = network;
    process.env.NIMIQ_RPC_URL = "https://example.mainnet/rpc";
    expect(nimiqRpcUrlFor("mainnet")).toBe("https://example.mainnet/rpc");
    expect(nimiqRpcUrlFor("testnet")).toBe(DEFAULT_NIMIQ_RPC.testnet);
    delete process.env.NIMIQ_RPC_URL;
    expect(nimiqRpcUrlFor("mainnet")).toBe("https://rpc.nimiqwatch.com/");
  });

  it("keeps a custom NIM RPC on the selected network only", () => {
    process.env.NIMIQ_NETWORK = "testnet";
    process.env.NIMIQ_RPC_URL = "https://example.test/rpc";
    expect(nimiqRpcUrlFor("testnet")).toBe("https://example.test/rpc");
    expect(nimiqRpcUrlFor("mainnet")).toBe(DEFAULT_NIMIQ_RPC.mainnet);
  });

  it("locks Polygon to official USDT and leaves Sepolia configurable", () => {
    process.env.USDT_CHAIN = "polygon";
    process.env.USDT_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
    process.env.USDT_RPC_URL = "https://example.polygon/rpc";
    expect(usdtEnabled()).toBe(true);
    expect(evmChain().usdt).toBe(EVM_CHAINS.polygon.usdt);
    expect(evmChain().rpcUrl).toBe("https://example.polygon/rpc");
    expect(evmConfigFor("sepolia").rpcUrl).toBe("https://ethereum-sepolia-rpc.publicnode.com");
    process.env.USDT_CHAIN = "sepolia";
    process.env.USDT_TOKEN_ADDRESS = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
    expect(evmChain().usdt).toBe("0xabcabcabcabcabcabcabcabcabcabcabcabcabca");
    expect(evmConfigFor("polygon").usdt).toBe(EVM_CHAINS.polygon.usdt);
  });

  it("still accepts a testnet NIM payment after NIMIQ_NETWORK flips to mainnet", async () => {
    const created = await createGroup({ kind: "bill", title: "Suya night", asset: "NIM", amount: "30", memberNames: ["Khalil", "Ada"], organizer: { name: "Khalil", nimAddress: ORG }, date: "2026-11-08" }, now);
    const joined = await join(created.group.id, { inviteCode: created.group.inviteCode, name: "Ada", nimAddress: A }, now);
    const share = requireGroup(created.group.id).shares.find((item) => item.memberId === joined.memberId);
    if (!share) throw new Error("no share");
    const intent = payIntent(requireGroup(created.group.id), share.id);
    pay(A, ORG, share.amount, intent.memo, "cc".repeat(32));
    process.env.NIMIQ_NETWORK = "mainnet";
    process.env.NIMIQ_RPC_URL = "https://rpc.nimiqwatch.com/";
    const claim = await claimPayment(created.group.id, share.id, "cc".repeat(32), now);
    expect(claim.status).toBe("paid");
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes("rpc.testnet.nimiqwatch.com"))).toBe(true);
  });

  it("verifies an existing mainnet group on mainnet after the env selects a testnet RPC", async () => {
    delete process.env.NIMIQ_NETWORK;
    const created = await createGroup({ kind: "bill", title: "Lunch", asset: "NIM", amount: "2", memberNames: ["Organizer", "Member"], organizer: { name: "Organizer", nimAddress: ORG }, date: "2026-11-08" }, now);
    const joined = await join(created.group.id, { inviteCode: created.group.inviteCode, name: "Member", nimAddress: A }, now);
    const share = requireGroup(created.group.id).shares.find((item) => item.memberId === joined.memberId);
    if (!share) throw new Error("no share");
    const intent = payIntent(requireGroup(created.group.id), share.id);
    pay(A, ORG, share.amount, intent.memo, "dd".repeat(32)).networkId = 24;
    process.env.NIMIQ_NETWORK = "testnet";
    process.env.NIMIQ_RPC_URL = "https://example.testnet/rpc";
    expect(await claimPayment(created.group.id, share.id, "dd".repeat(32), now)).toMatchObject({ status: "paid" });
    expect(vi.mocked(fetch).mock.calls.every((call) => String(call[0]) === DEFAULT_NIMIQ_RPC.mainnet)).toBe(true);
  });

  it("verifies Polygon USDT against the official token even when USDT_TOKEN_ADDRESS is set", async () => {
    process.env.USDT_CHAIN = "polygon";
    process.env.USDT_TOKEN_ADDRESS = "0x00000000000000000000000000000000000000aa";
    const created = await createGroup({ kind: "bill", title: "Lunch", asset: "USDT", amount: "5", memberNames: ["Khalil", "Ada"], organizer: { name: "Khalil", evmAddress: RECIPIENT }, date: "2026-11-08" }, now);
    expect(created.group.chain).toBe("polygon");
    const joined = await join(created.group.id, { inviteCode: created.group.inviteCode, name: "Ada", evmAddress: PAYER }, now);
    const share = requireGroup(created.group.id).shares.find((item) => item.memberId === joined.memberId);
    if (!share) throw new Error("no share");
    expect(payIntent(requireGroup(created.group.id), share.id).evm?.token).toBe(EVM_CHAINS.polygon.usdt);
    evmReceipt = usdtReceipt(BigInt(share.amount));
    const claim = await claimPayment(created.group.id, share.id, "0x" + "ab".repeat(32), now);
    expect(claim.status).toBe("paid");
    if (claim.status === "paid") expect(claim.payment.explorerUrl).toContain("polygonscan.com/tx/0x");
  });
});
