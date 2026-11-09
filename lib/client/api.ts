"use client";

import type { PublicGroup } from "../service";
import { entryFor } from "./local";

export type { PublicGroup };

export async function api<T>(path: string, init: RequestInit & { groupId?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.groupId) {
    const entry = entryFor(init.groupId);
    if (entry?.adminToken) headers.set("x-admin-token", entry.adminToken);
    if (entry?.memberToken) headers.set("x-member-token", entry.memberToken);
  }
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
