import { fromAtomic, toAtomic } from "../vendor/paylink-core";
import type { Asset } from "./types";

export const DECIMALS: Record<Asset, number> = { NIM: 5, USDT: 6 };
/** Decimals worth showing in the UI. */
export const DISPLAY_DECIMALS: Record<Asset, number> = { NIM: 2, USDT: 2 };

export function toUnits(amount: string, asset: Asset): bigint {
  return toAtomic(amount, DECIMALS[asset]);
}

export function fromUnits(units: bigint | string, asset: Asset): string {
  return fromAtomic(typeof units === "string" ? BigInt(units) : units, DECIMALS[asset]);
}

/** "12,480.50" split into whole and decimals, for greyed-decimal Keel numbers. */
export function splitAmount(units: bigint | string, asset: Asset): { whole: string; decimals: string } {
  const text = fromUnits(units, asset);
  const [whole = "0", frac = ""] = text.split(".");
  const shown = Math.max(DISPLAY_DECIMALS[asset], Math.min(frac.length, DECIMALS[asset]));
  const decimals = (frac + "0".repeat(shown)).slice(0, shown);
  return { whole: whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","), decimals };
}

export function formatAmount(units: bigint | string, asset: Asset): string {
  const { whole, decimals } = splitAmount(units, asset);
  return `${whole}.${decimals} ${asset}`;
}

/** Split `total` into `count` parts that differ by at most one unit and sum exactly to `total`. */
export function splitEvenly(total: bigint, count: number): bigint[] {
  if (count < 1) throw new Error("Need at least one person to split between");
  const base = total / BigInt(count);
  const remainder = Number(total % BigInt(count));
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1n : 0n));
}
