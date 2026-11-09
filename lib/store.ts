import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Group } from "./domain/types";
import { dataDir } from "./env";

interface Database {
  version: 1;
  groups: Record<string, Group>;
}

let memory: Database | null = null;
let loadedMtime = -1;
let queue: Promise<unknown> = Promise.resolve();

function dbPath(): string {
  return path.join(dataDir(), "circles.json");
}

function mtime(): number {
  try {
    return statSync(dbPath()).mtimeMs;
  } catch {
    return 0;
  }
}

/** Reads through a small cache that is invalidated when the file changes (route bundles may hold separate module copies). */
function load(): Database {
  const current = mtime();
  if (memory && current === loadedMtime) return memory;
  loadedMtime = current;
  try {
    const parsed = JSON.parse(readFileSync(dbPath(), "utf8")) as Database;
    memory = parsed.version === 1 ? parsed : { version: 1, groups: {} };
  } catch {
    memory = { version: 1, groups: {} };
  }
  return memory;
}

function persist(db: Database): void {
  mkdirSync(dataDir(), { recursive: true });
  const target = dbPath();
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2));
  renameSync(temp, target);
  loadedMtime = mtime();
}

export function readGroup(id: string): Group | undefined {
  const group = load().groups[id];
  return group ? (structuredClone(group) as Group) : undefined;
}

export function findGroupByInvite(code: string): Group | undefined {
  const group = Object.values(load().groups).find((item) => item.inviteCode === code);
  return group ? (structuredClone(group) as Group) : undefined;
}

export function listGroups(ids: string[]): Group[] {
  const db = load();
  return ids.map((id) => db.groups[id]).filter((group): group is Group => Boolean(group)).map((group) => structuredClone(group) as Group);
}

/** Serialised read-modify-write so concurrent requests never lose an update. */
export function mutateGroup<T>(id: string, fn: (group: Group) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = load();
    const current = db.groups[id];
    if (!current) throw Object.assign(new Error("Group not found"), { status: 404 });
    const draft = structuredClone(current) as Group;
    const result = await fn(draft);
    db.groups[id] = draft;
    persist(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function insertGroup(group: Group): Promise<void> {
  const run = queue.then(() => {
    const db = load();
    db.groups[group.id] = group;
    persist(db);
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Test hook. */
export function resetStoreForTests(): void {
  memory = null;
  loadedMtime = -1;
}
