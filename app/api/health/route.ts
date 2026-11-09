import { json } from "@/lib/http";
import { nimiqNetwork } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ ok: true, app: "paylink-nimiq", nimiqNetwork: nimiqNetwork() });
}
