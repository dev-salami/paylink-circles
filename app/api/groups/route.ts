import type { NewGroupInput } from "@/lib/domain/groups";
import { body, handle } from "@/lib/http";
import { createGroup, publicGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handle(async () => {
    const input = await body<NewGroupInput>(request);
    const { group, adminToken, memberToken, memberId } = await createGroup({
      ...input,
      memberNames: Array.isArray(input.memberNames) ? input.memberNames.map(String) : [],
      organizer: input.organizer ?? { name: "" },
    });
    return { group: publicGroup(group, { adminToken, memberToken }), adminToken, memberToken, memberId };
  });
}
