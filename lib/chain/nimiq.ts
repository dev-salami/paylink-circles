import { normalizeNimiqAddress, sameNimiqAddress } from "../domain/address";
import { hexToUtf8, parseMemo } from "../domain/memo";

export type NimiqNetwork = "testnet" | "mainnet";

export const NIMIQ_NETWORK_ID: Record<NimiqNetwork, number> = { testnet: 5, mainnet: 24 };

export const DEFAULT_NIMIQ_RPC: Record<NimiqNetwork, string> = {
  testnet: "https://rpc.testnet.nimiqwatch.com/",
  mainnet: "https://rpc.nimiqwatch.com/",
};

export function nimiqExplorerUrl(network: NimiqNetwork, hash: string): string {
  return network === "mainnet" ? `https://nimiq.watch/#${hash}` : `https://test.nimiq.watch/#${hash}`;
}

/** 64 hex chars, no 0x. Null when the string is not a transaction hash. */
export function normalizeNimiqHash(hash: string): string | null {
  const bare = hash.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(bare)) return null;
  return bare.toLowerCase();
}

/** Shape returned by the Albatross JSON-RPC for getTransactionByHash / getTransactionsByAddress. */
export interface NimiqRpcTransaction {
  hash: string;
  blockNumber?: number;
  timestamp?: number;
  confirmations?: number;
  from: string;
  to: string;
  value: number;
  fee: number;
  recipientData?: string;
  senderData?: string;
  networkId?: number;
  executionResult?: boolean;
}

export interface NimiqExpectation {
  network: NimiqNetwork;
  recipient: string;
  /** Luna. */
  minValue: bigint;
  memoCode: string;
}

export type VerifyResult =
  | { ok: true; from: string; to: string; value: bigint; memo: string; blockNumber?: number }
  | { ok: false; reason: string; retry: boolean };

export function verifyNimiqTransaction(tx: NimiqRpcTransaction | null, expect: NimiqExpectation): VerifyResult {
  if (!tx) return { ok: false, reason: "Transaction not on chain yet", retry: true };
  if (tx.networkId !== undefined && tx.networkId !== NIMIQ_NETWORK_ID[expect.network]) {
    return { ok: false, reason: `Transaction is on the wrong Nimiq network`, retry: false };
  }
  if (tx.executionResult === false) return { ok: false, reason: "Transaction failed on chain", retry: false };
  if (!tx.blockNumber || (tx.confirmations ?? 0) < 1) return { ok: false, reason: "Waiting for the transaction to be included", retry: true };
  if (!sameNimiqAddress(tx.to, expect.recipient)) return { ok: false, reason: "Payment went to a different address", retry: false };
  const value = BigInt(tx.value);
  if (value < expect.minValue) return { ok: false, reason: "Payment is less than the share", retry: false };
  const memo = hexToUtf8(tx.recipientData ?? "");
  if (parseMemo(memo) !== expect.memoCode) return { ok: false, reason: "Payment memo doesn't match this share", retry: false };
  return { ok: true, from: normalizeNimiqAddress(tx.from), to: normalizeNimiqAddress(tx.to), value, memo, blockNumber: tx.blockNumber };
}

export class NimiqRpc {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Nimiq RPC ${method} failed (${response.status})`);
    const json = (await response.json()) as { result?: { data: T }; error?: { message: string; data?: string } };
    if (json.error) throw new Error(`Nimiq RPC ${method}: ${json.error.message}${json.error.data ? ` (${json.error.data})` : ""}`);
    return json.result?.data as T;
  }

  async getTransaction(hash: string): Promise<NimiqRpcTransaction | null> {
    try {
      return await this.call<NimiqRpcTransaction>("getTransactionByHash", [hash]);
    } catch (error) {
      if (error instanceof Error && /not found|Transaction not found|-32/.test(error.message)) return null;
      throw error;
    }
  }

  async getTransactionsByAddress(address: string, max = 100): Promise<NimiqRpcTransaction[]> {
    return (await this.call<NimiqRpcTransaction[]>("getTransactionsByAddress", [normalizeNimiqAddress(address), max, null])) ?? [];
  }

  async getBlockNumber(): Promise<number> {
    return this.call<number>("getBlockNumber", []);
  }
}
