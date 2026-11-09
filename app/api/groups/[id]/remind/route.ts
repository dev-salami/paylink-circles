import { body, handle, tokens } from "@/lib/http";
import { remind } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const input = await body<{ shareIds?: string[] }>(request).catch(() => ({ shareIds: undefined }));
    const reminders = await remind(id, tokens(request).adminToken, { shareIds: input.shareIds });
    return { reminders };
  });
}
