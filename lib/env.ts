import { DEFAULT_NIMIQ_RPC, type NimiqNetwork } from "./chain/nimiq";
import { EVM_CHAINS, type EvmChain, type EvmChainConfig } from "./chain/evm";

export function nimiqNetwork(): NimiqNetwork {
  return process.env.NIMIQ_NETWORK === "testnet" ? "testnet" : "mainnet";
}

/** RPC for one Nimiq network. A custom URL applies only to the network selected by NIMIQ_NETWORK. */
export function nimiqRpcUrlFor(network: NimiqNetwork): string {
  return nimiqNetwork() === network && process.env.NIMIQ_RPC_URL ? process.env.NIMIQ_RPC_URL : DEFAULT_NIMIQ_RPC[network];
}

export function nimiqRpcUrl(): string {
  return nimiqRpcUrlFor(nimiqNetwork());
}

/**
 * Chain config for a USDT group. Polygon always uses official USDT
 * (0xc2132D05D31c914a87C6611C10748AEb04B58e8F). USDT_TOKEN_ADDRESS is only
 * for Sepolia, which has no official USDT. A custom RPC applies only when it
 * matches the chain being read.
 */
export function evmConfigFor(chain: EvmChain): EvmChainConfig {
  const base = EVM_CHAINS[chain];
  const selected: EvmChain = process.env.USDT_CHAIN === "sepolia" ? "sepolia" : "polygon";
  const override = process.env.USDT_TOKEN_ADDRESS as `0x${string}` | undefined;
  return {
    ...base,
    rpcUrl: selected === chain && process.env.USDT_RPC_URL ? process.env.USDT_RPC_URL : base.rpcUrl,
    usdt: chain === "sepolia" && override ? override : base.usdt,
  };
}

export function evmChain(): EvmChainConfig {
  return evmConfigFor(process.env.USDT_CHAIN === "sepolia" ? "sepolia" : "polygon");
}

export function usdtEnabled(): boolean {
  return !/^0x0+$/.test(evmChain().usdt);
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3020").replace(/\/$/, "");
}

export function dataDir(): string {
  return process.env.DATA_DIR || `${process.cwd()}/data`;
}

/** Public config the client needs. Nothing secret. */
export function publicConfig() {
  const evm = evmChain();
  return {
    nimiqNetwork: nimiqNetwork(),
    usdt: usdtEnabled() ? { chain: evm.id, chainIdHex: evm.chainIdHex, name: evm.name, token: evm.usdt, gasToken: evm.gasToken } : null,
  };
}

export type PublicConfig = ReturnType<typeof publicConfig>;
