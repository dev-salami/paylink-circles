"use client";

import { getHostNetwork, init, NimiqProviderError, type NimiqProvider } from "@nimiq/mini-app-sdk";
import { encodeFunctionData } from "viem";
import { ERC20_ABI, evmAddChainParam, sameChainId, selectEvmPayer, type EvmChainConfig } from "../chain/evm";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  providers?: Eip1193[];
}

const USDT_HOST_MISSING = "USDT only works inside Nimiq Pay. Use Open in Nimiq Pay, or paste this page into Mini Apps → Custom URL. Nothing was sent.";

let announced: Eip1193 | undefined;

function readEthereum(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as { ethereum?: Eip1193; nimiqPay?: { ethereum?: Eip1193 } };
  const injected = win.ethereum;
  if (injected && typeof injected.request === "function") return injected;
  const listed = injected?.providers?.find((item) => typeof item?.request === "function");
  if (listed) return listed;
  if (win.nimiqPay?.ethereum && typeof win.nimiqPay.ethereum.request === "function") return win.nimiqPay.ethereum;
  return announced;
}

/** window.ethereum can arrive a moment after the Nimiq provider, including via EIP-6963. */
export function waitForEthereum(timeout = 2000): Promise<Eip1193 | undefined> {
  const found = readEthereum();
  if (found) return Promise.resolve(found);
  if (typeof window === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider?: Eip1193) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(provider ?? readEthereum());
    };
    const onAnnounce = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: Eip1193 }>).detail?.provider;
      if (provider && typeof provider.request === "function") {
        announced = provider;
        finish(provider);
      }
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = window.setTimeout(() => finish(), timeout);
  });
}

function errorCode(error: unknown): number | undefined {
  const value = error as { code?: number; error?: { code?: number }; data?: { code?: number } };
  return value?.code ?? value?.error?.code ?? value?.data?.code;
}

let nimiqPromise: Promise<NimiqProvider> | null = null;

/** True when the page runs inside Nimiq Pay (the host seeds window.nimiqPay before scripts run). */
export function inNimiqPay(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.nimiqPay || window.nimiq);
}

export function hostNetwork(): "mainnet" | "testnet" | undefined {
  return typeof window === "undefined" ? undefined : getHostNetwork();
}

export function getNimiq(timeout = 8000): Promise<NimiqProvider> {
  if (!nimiqPromise) {
    nimiqPromise = init({ timeout }).catch((error) => {
      nimiqPromise = null;
      throw error;
    });
  }
  return nimiqPromise;
}

/** Ask Nimiq Pay for the user's NIM address. Opens a native approval dialog the first time. */
export async function connectNimiq(): Promise<string> {
  const nimiq = await getNimiq();
  const accounts = await nimiq.listAccounts();
  const first = accounts[0];
  if (!first) throw new Error("Nimiq Pay didn't share an address");
  return first;
}

/** Ask Nimiq Pay for the user's EVM address, used for USDT. The same address works on every EVM chain. */
export async function connectEvm(): Promise<string> {
  const provider = await waitForEthereum();
  if (!provider) throw new Error(USDT_HOST_MISSING);
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const picked = selectEvmPayer(accounts);
  if (!picked.ok) throw new Error(picked.reason);
  return picked.from;
}

export async function payNim(input: { recipient: string; luna: string; memo: string; network: "mainnet" | "testnet" }): Promise<string> {
  const nimiq = await getNimiq();
  // Re-read on the tap: the wallet network can change after the screen rendered.
  const network = hostNetwork();
  if (network && network !== input.network) {
    throw new Error(`Nimiq Pay is on ${network}. Switch to ${input.network} for this group before paying. Nothing was sent.`);
  }
  const value = Number(input.luna);
  if (!Number.isSafeInteger(value)) throw new Error("Amount is too large");
  return nimiq.sendBasicTransactionWithData({ recipient: input.recipient, value, data: input.memo });
}

export async function nimBalance(address: string): Promise<number | null> {
  try {
    const nimiq = await getNimiq(3000);
    if (typeof nimiq.getBalance !== "function") return null;
    return await nimiq.getBalance(address);
  } catch {
    return null;
  }
}

async function ensureEvmChain(provider: Eip1193, chain: Pick<EvmChainConfig, "id" | "chainIdHex" | "name" | "rpcUrl" | "explorer" | "usdt" | "gasToken">): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof current === "string" && sameChainId(current, chain.chainIdHex)) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainIdHex }] });
  } catch (error) {
    if (errorCode(error) === 4001) throw error;
    if (errorCode(error) !== 4902) throw error;
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [evmAddChainParam(chain)] });
    } catch (addError) {
      if (errorCode(addError) === 4001) throw addError;
      throw new Error(`${chain.name} isn't available in this Nimiq Pay yet. Update the app and try again. Nothing was sent.`);
    }
  }
  const after = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof after === "string" && !sameChainId(after, chain.chainIdHex)) {
    throw new Error(`Nimiq Pay is still on another network. Switch to ${chain.name} and try again. Nothing was sent.`);
  }
}

export async function payUsdt(input: { chainIdHex: string; token: string; to: string; amount: string; from?: string; chainName?: string; rpcUrl?: string; explorer?: string; gasToken?: string }): Promise<string> {
  if (!input.token || /^0x0+$/i.test(input.token)) throw new Error("USDT isn't configured for this group. Nothing was sent.");
  const provider = await waitForEthereum();
  if (!provider) throw new Error(USDT_HOST_MISSING);
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const payer = selectEvmPayer(accounts, input.from);
  if (!payer.ok) throw new Error(payer.reason);
  const chainName = input.chainName ?? "Polygon";
  await ensureEvmChain(provider, {
    id: input.chainIdHex.toLowerCase() === "0x89" ? "polygon" : "sepolia",
    chainIdHex: input.chainIdHex as `0x${string}`,
    name: chainName,
    rpcUrl: input.rpcUrl ?? (input.chainIdHex.toLowerCase() === "0x89" ? "https://polygon-bor-rpc.publicnode.com" : "https://ethereum-sepolia-rpc.publicnode.com"),
    usdt: input.token as `0x${string}`,
    explorer: input.explorer ?? (input.chainIdHex.toLowerCase() === "0x89" ? "https://polygonscan.com/tx/" : "https://sepolia.etherscan.io/tx/"),
    gasToken: input.gasToken ?? (input.chainIdHex.toLowerCase() === "0x89" ? "POL" : "SepoliaETH"),
  });
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [input.to as `0x${string}`, BigInt(input.amount)] });
  return (await provider.request({ method: "eth_sendTransaction", params: [{ from: payer.from, to: input.token, data, value: "0x0" }] })) as string;
}

/** Plain-language message for wallet errors. Cancelling is a normal outcome, not an alarm. */
export function walletErrorMessage(error: unknown): { message: string; cancelled: boolean } {
  if (NimiqProviderError.is(error)) {
    if (error.type === "PERMISSION_DENIED") return { message: "You cancelled in Nimiq Pay. Nothing was sent.", cancelled: true };
    if (error.type === "NETWORK_ERROR") return { message: "Nimiq Pay couldn't reach the network. Check your connection; if it was sent, we'll still pick it up.", cancelled: false };
    if (error.type === "INVALID_TRANSACTION") return { message: `Nimiq Pay rejected the transaction: ${error.message}`, cancelled: false };
    return { message: error.message || "Nimiq Pay couldn't complete that", cancelled: false };
  }
  const code = errorCode(error);
  if (code === 4001) return { message: "You cancelled in Nimiq Pay. Nothing was sent.", cancelled: true };
  const message = error instanceof Error ? error.message : String(error);
  if (/timed? ?out|not injected|window\.nimiq/i.test(message)) return { message: "Open this page inside Nimiq Pay to use your wallet.", cancelled: false };
  if (/gas/i.test(message)) return { message: "Not enough gas for this network. Top up a little POL and try again.", cancelled: false };
  if (/insufficient/i.test(message)) return { message: "Your balance is too low for this payment.", cancelled: false };
  return { message, cancelled: false };
}
