import { body, handle } from "@/lib/http";
import { join, publicGroup, requireGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

interface JoinRequest {
  inviteCode: string;
  memberId?: string;
  name: string;
  nimAddress?: string;
  evmAddress?: string;
  email?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const input = await body<JoinRequest>(request);
    const result = await join(id, {
      inviteCode: String(input.inviteCode ?? ""),
      memberId: input.memberId ? String(input.memberId) : undefined,
      name: String(input.name ?? ""),
      nimAddress: input.nimAddress ? String(input.nimAddress) : undefined,
      evmAddress: input.evmAddress ? String(input.evmAddress) : undefined,
      email: input.email ? String(input.email) : undefined,
    });
    return { ...result, group: publicGroup(requireGroup(id), { memberToken: result.memberToken }) };
  });
}
