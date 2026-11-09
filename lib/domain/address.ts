/**
 * Nimiq user-friendly addresses: "NQ" + 2 check digits + 32 base32 characters,
 * shown in 9 groups of 4. The check digits follow IBAN mod-97.
 */
const NIMIQ_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

export function normalizeNimiqAddress(input: string): string {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

function ibanMod97(text: string): number {
  const digits = text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 65 && code <= 90 ? String(code - 55) : char;
    })
    .join("");
  let remainder = 0;
  for (let index = 0; index < digits.length; index += 6) {
    remainder = Number(String(remainder) + digits.slice(index, index + 6)) % 97;
  }
  return remainder;
}

export function isValidNimiqAddress(input: string): boolean {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  if (!/^NQ\d{2}[0-9A-Z]{32}$/.test(compact)) return false;
  const body = compact.slice(4);
  if (![...body].every((char) => NIMIQ_ALPHABET.includes(char))) return false;
  return ibanMod97(body + compact.slice(0, 4)) === 1;
}

export function isValidEvmAddress(input: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(input.trim());
}

export function sameEvmAddress(left?: string, right?: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function sameNimiqAddress(left?: string, right?: string): boolean {
  return Boolean(left && right && normalizeNimiqAddress(left) === normalizeNimiqAddress(right));
}

export function shortAddress(address: string): string {
  if (address.startsWith("0x")) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (!/^NQ/i.test(address.trim())) return `${address.slice(0, 8)}…${address.slice(-6)}`;
  const parts = normalizeNimiqAddress(address).split(" ");
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`;
}
