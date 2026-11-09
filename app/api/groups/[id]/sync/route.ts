import { handle, tokens } from "@/lib/http";
import { publicGroup, requireGroup, syncGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const result = await syncGroup(id);
    return { ...result, group: publicGroup(requireGroup(id), tokens(request)) };
  });
}
