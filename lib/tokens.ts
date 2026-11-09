import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string | null | undefined, hash: string | undefined): boolean {
  if (!token || !hash) return false;
  const left = Buffer.from(hashToken(token), "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
