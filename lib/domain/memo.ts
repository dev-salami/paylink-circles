/** On-chain memo that ties a NIM payment to a share. Must stay within 64 bytes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MEMO_PREFIX = "PayLink";

export function createShareCode(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = random(new Uint8Array(8));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function memoFor(code: string, label?: string): string {
  const base = `${MEMO_PREFIX} ${code}`;
  if (!label) return base;
  const tail = ` ${label.replace(/[^\x20-\x7e]/g, "").trim()}`;
  return (base + tail).slice(0, 64).trim();
}

export function parseMemo(text: string): string | null {
  const match = text.match(new RegExp(`${MEMO_PREFIX} ([${CODE_ALPHABET}]{8})\\b`));
  return match?.[1] ?? null;
}

export function hexToUtf8(hex: string): string {
  if (!hex) return "";
  const clean = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
