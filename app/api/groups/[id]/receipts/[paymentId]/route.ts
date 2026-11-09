import { handle } from "@/lib/http";
import { receiptFor } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  return handle(async () => receiptFor(id, paymentId));
}
