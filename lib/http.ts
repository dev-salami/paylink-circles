import { NextResponse } from "next/server";
import { GroupError } from "./domain/groups";

export function json(data: unknown, init?: number | ResponseInit) {
  const options = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, { ...options, headers: { "Cache-Control": "no-store", ...(options?.headers ?? {}) } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (error) {
    if (error instanceof GroupError) return json({ error: error.message }, error.status);
    const status = (error as { status?: number }).status;
    if (status === 404) return json({ error: "Not found" }, 404);
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Something went wrong" }, 500);
  }
}

export async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new GroupError("Invalid request body");
  }
}

export function tokens(request: Request) {
  return { adminToken: request.headers.get("x-admin-token"), memberToken: request.headers.get("x-member-token") };
}
