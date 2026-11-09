import { handle } from "@/lib/http";
import { payIntent, requireGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  return handle(async () => payIntent(requireGroup(id), shareId));
}
