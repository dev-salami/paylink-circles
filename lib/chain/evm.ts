import { decodeEventLog, parseAbi, type Hex } from "viem";
import { sameEvmAddress, shortAddress } from "../domain/address";

export type EvmChain = "polygon" | "sepolia";

export interface EvmChainConfig {
  id: EvmChain;
  chainIdHex: `0x${string}`;
  name: string;
  rpcUrl: string;
  usdt: `0x${string}`;
  explorer: string;
  gasToken: string;
}

export const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

/** Defaults from the Nimiq Mini Apps docs. Sepolia has no official USDT, so its token must be configured. */
export const EVM_CHAINS: Record<EvmChain, EvmChainConfig> = {
  polygon: {
    id: "polygon",
    chainIdHex: "0x89",
    name: "Polygon",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    explorer: "https://polygonscan.com/tx/",
    gasToken: "POL",
  },
  sepolia: {
    id: "sepolia",
    chainIdHex: "0xaa36a7",
    name: "Sepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    usdt: "0x0000000000000000000000000000000000000000",
    explorer: "https://sepolia.etherscan.io/tx/",
    gasToken: "SepoliaETH",
  },
};

export interface EvmReceiptLog {
  address?: string;
  topics?: string[] | null;
  data?: string;
}

export interface EvmReceipt {
  status?: string | number | null;
  from?: string;
  to?: string | null;
  blockNumber?: string | number | null;
  logs?: EvmReceiptLog[] | null;
}

/** Polygon and Sepolia parameters for wallet_addEthereumChain (EIP-3085). */
export function evmAddChainParam(config: EvmChainConfig) {
  const symbol = config.id === "polygon" ? "POL" : "ETH";
  return {
    chainId: config.chainIdHex,
    chainName: config.name,
    nativeCurrency: { name: config.gasToken, symbol, decimals: 18 },
    rpcUrls: [config.rpcUrl],
    blockExplorerUrls: [config.explorer.replace(/\/tx\/?$/, "")],
  };
}

/** 0x-prefixed 32-byte hash. Null when the string is not a transaction hash. */
export function normalizeEvmHash(hash: string): string | null {
  const bare = hash.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(bare)) return null;
  return `0x${bare.toLowerCase()}`;
}

export function sameChainId(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

/** The account that must sign. Refuses to substitute a different wallet. */
export function selectEvmPayer(accounts: string[], required?: string): { ok: true; from: string } | { ok: false; reason: string } {
  const list = accounts.filter((account) => typeof account === "string" && account.length > 0);
  const first = list[0];
  if (!first) return { ok: false, reason: "Nimiq Pay didn't share an address. Nothing was sent." };
  if (!required) return { ok: true, from: first };
  const match = list.find((account) => account.toLowerCase() === required.toLowerCase());
  if (!match) {
    return {
      ok: false,
      reason: `This share has to be paid from ${shortAddress(required)}. Nimiq Pay is using ${shortAddress(first)}. Switch to that account and try again. Nothing was sent.`,
    };
  }
  return { ok: true, from: match };
}

export interface UsdtExpectation {
  token: string;
  recipient: string;
  minValue: bigint;
  /** If the member registered an EVM address, the transfer must come from it. */
  payer?: string;
}

export type UsdtVerifyResult =
  | { ok: true; from: string; to: string; value: bigint; blockNumber?: number }
  | { ok: false; reason: string; retry: boolean };

function transferSucceeded(status: EvmReceipt["status"]): boolean | null {
  if (status == null || status === "") return null;
  try {
    return BigInt(status) === 1n;
  } catch {
    return false;
  }
}

function blockNumberOf(value: EvmReceipt["blockNumber"]): number | undefined {
  if (value == null || value === "") return undefined;
  try {
    const parsed = Number(BigInt(value));
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function verifyUsdtReceipt(receipt: EvmReceipt | null, expect: UsdtExpectation): UsdtVerifyResult {
  if (!receipt) return { ok: false, reason: "Transaction not mined yet", retry: true };
  const succeeded = transferSucceeded(receipt.status);
  if (succeeded === null) return { ok: false, reason: "Transaction not mined yet", retry: true };
  if (!succeeded) return { ok: false, reason: "Transaction reverted", retry: false };
  let mismatch: UsdtVerifyResult | null = null;
  for (const log of receipt.logs ?? []) {
    if (!log.address || !sameEvmAddress(log.address, expect.token)) continue;
    if (!log.data || !log.topics?.length) continue;
    try {
      const decoded = decodeEventLog({ abi: ERC20_ABI, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
      if (!sameEvmAddress(to, expect.recipient)) continue;
      if (expect.payer && !sameEvmAddress(from, expect.payer)) {
        mismatch = { ok: false, reason: "Transfer came from a different wallet", retry: false };
        continue;
      }
      if (value < expect.minValue) {
        mismatch = { ok: false, reason: "Transfer is less than the share", retry: false };
        continue;
      }
      return { ok: true, from, to, value, blockNumber: blockNumberOf(receipt.blockNumber) };
    } catch {
      continue;
    }
  }
  return mismatch ?? { ok: false, reason: "No USDT transfer to the recipient in this transaction", retry: false };
}

export async function fetchReceipt(rpcUrl: string, hash: string, fetchImpl: typeof fetch = fetch): Promise<EvmReceipt | null> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`EVM RPC failed (${response.status})`);
  const json = (await response.json()) as { result?: EvmReceipt | null; error?: { message: string } };
  if (json.error) throw new Error(`EVM RPC: ${json.error.message}`);
  return json.result ?? null;
}
