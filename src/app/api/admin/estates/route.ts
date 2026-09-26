import { audit } from "@/server/audit";
import { EstateBody, createEstate } from "@/server/reference";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";

/** Adds an estate, optionally licensed to a company. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("platform.companies.manage");
    const parsed = EstateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the details.");
    const estate = await createEstate(parsed.data);
    await audit(session, { action: "estate.create", target: estate.code, company: estate.company, detail: { ...estate } });
    return Response.json({ ok: true, estate });
  } catch (err) {
    return errorResponse(err);
  }
}
