import { handle } from "@/lib/http";
import { GroupError, groupForInvite } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return handle(async () => {
    const group = groupForInvite(code.toUpperCase());
    if (!group) throw new GroupError("This invite link isn't valid", 404);
    return {
      groupId: group.id,
      title: group.title,
      kind: group.kind,
      asset: group.asset,
      chain: group.chain,
      openSpots: group.members.filter((member) => !member.joinedAt).map((member) => ({ id: member.id, name: member.name, slot: member.slot })),
      organizer: group.members.find((member) => member.isOrganizer)?.name ?? "Organizer",
    };
  });
}
