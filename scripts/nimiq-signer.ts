/**
 * Testnet helper: signs and broadcasts a NIM transaction with a memo using @nimiq/core,
 * exactly what Nimiq Pay does on the user's phone when the mini app calls
 * sendBasicTransactionWithData. Keys come from a local file or env and are never printed.
 */
import { readFileSync } from "node:fs";
import * as Nimiq from "@nimiq/core";

export interface TestWallet {
  name: string;
  address: string;
  keyPair: Nimiq.KeyPair;
}

const RPC = process.env.NIMIQ_RPC_URL || "https://rpc.testnet.nimiqwatch.com/";
const TESTNET_ID = 5;

export function loadWallets(file = process.env.NIMIQ_TEST_KEYS): Record<string, TestWallet> {
  if (!file) throw new Error("Set NIMIQ_TEST_KEYS to a local JSON file of throwaway testnet wallets");
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, { address: string; privateKey: string }>;
  const out: Record<string, TestWallet> = {};
  for (const [name, entry] of Object.entries(raw)) {
    const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(entry.privateKey));
    const address = keyPair.toAddress().toUserFriendlyAddress();
    if (address.replace(/\s/g, "") !== entry.address.replace(/\s/g, "")) throw new Error(`Key for ${name} doesn't match its address`);
    out[name] = { name, address, keyPair };
  }
  return out;
}

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = (await response.json()) as { result?: { data: T }; error?: { message: string; data?: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message} ${json.error.data ?? ""}`);
  return json.result?.data as T;
}

export async function balanceOf(address: string): Promise<number> {
  const account = await rpc<{ balance: number }>("getAccountByAddress", [address.replace(/\s/g, "")]);
  return account.balance;
}

/** Sends `luna` from `wallet` to `recipient` with `memo` as recipient data. Returns the tx hash. */
export async function sendNim(wallet: TestWallet, recipient: string, luna: bigint, memo: string): Promise<string> {
  const height = await rpc<number>("getBlockNumber", []);
  const data = new TextEncoder().encode(memo);
  if (data.length > 64) throw new Error("Memo is longer than 64 bytes");
  const tx = Nimiq.TransactionBuilder.newBasicWithData(wallet.keyPair.toAddress(), Nimiq.Address.fromUserFriendlyAddress(recipient), data, luna, 0n, height, TESTNET_ID);
  tx.sign(wallet.keyPair, undefined);
  const hash = await rpc<string>("sendRawTransaction", [tx.toHex()]);
  return hash || tx.hash();
}
