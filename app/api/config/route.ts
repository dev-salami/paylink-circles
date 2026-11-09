import { publicConfig } from "@/lib/env";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET() {
  return json(publicConfig());
}
