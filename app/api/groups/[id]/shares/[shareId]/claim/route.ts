import { body, handle } from "@/lib/http";
import { claimPayment } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  return handle(async () => {
    const input = await body<{ txHash?: string }>(request);
    return claimPayment(id, shareId, String(input.txHash ?? ""));
  });
}
