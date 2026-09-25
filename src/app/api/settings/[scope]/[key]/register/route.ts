import { registerUrls } from "@/server/payments";
import { requireSettingsScope } from "@/server/settingsAccess";
import { errorResponse } from "@/server/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ scope: string; key: string }> };

/** Registers this company's Paybill confirmation URLs with Safaricom. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { scope, key } = await params;
    if (key !== "mpesa") return Response.json({ error: "Only M-Pesa registers URLs." }, { status: 404 });
    const session = await requireSettingsScope(scope, "mpesa");
    return Response.json(await registerUrls(scope, session));
  } catch (err) {
    return errorResponse(err);
  }
}
