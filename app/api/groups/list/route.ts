import { body, handle } from "@/lib/http";
import { publicGroup } from "@/lib/service";
import { listGroups } from "@/lib/store";

export const dynamic = "force-dynamic";

interface ListRequest {
  entries?: Array<{ id: string; adminToken?: string; memberToken?: string }>;
}

export function POST(request: Request) {
  return handle(async () => {
    const input = await body<ListRequest>(request);
    const entries = (input.entries ?? []).slice(0, 50);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const groups = new Map(listGroups(entries.map((entry) => entry.id)).map((group) => [group.id, group]));
    return {
      groups: [...groups.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((group) => publicGroup(group, byId.get(group.id) ?? {})),
    };
  });
}
