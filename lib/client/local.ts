"use client";

/** Per-device memory of the groups this phone created or joined. Tokens never leave the device except as request headers. */
export interface LocalEntry {
  id: string;
  adminToken?: string;
  memberToken?: string;
  memberId?: string;
  title?: string;
}

const KEY = "paylink-circles:v1";

export function readEntries(): LocalEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as LocalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function entryFor(id: string): LocalEntry | undefined {
  return readEntries().find((entry) => entry.id === id);
}

export function saveEntry(entry: LocalEntry): void {
  const entries = readEntries().filter((item) => item.id !== entry.id);
  const previous = readEntries().find((item) => item.id === entry.id);
  entries.unshift({ ...previous, ...entry });
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 50)));
}

const ADDRESS_KEY = "paylink-circles:addresses";

export function rememberAddress(address: string): void {
  try {
    const list = new Set(JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? "[]") as string[]);
    list.add(address);
    localStorage.setItem(ADDRESS_KEY, JSON.stringify([...list].slice(-4)));
  } catch {
    // storage may be unavailable
  }
}

export function rememberedAddresses(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const DISMISS_KEY = "paylink-circles:dismissed";

export function dismissedAlerts(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function dismissAlert(id: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissedAlerts(), id]));
  } catch {
    // ignore
  }
}
