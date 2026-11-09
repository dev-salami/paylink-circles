import { handle, tokens } from "@/lib/http";
import { publicGroup, requireGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => publicGroup(requireGroup(id), tokens(request)));
}
