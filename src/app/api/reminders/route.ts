import { audit } from "@/server/audit";
import { arrears, runReminders } from "@/server/billing";
import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, HttpError, requirePermission } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function companyFor(request: Request, permission: string) {
  const session = await requirePermission(permission);
  const company = new URL(request.url).searchParams.get("company") ?? session.scope.companyId ?? "";
  const companies = await visibleCompanies(session);
  if (!company || (companies !== null && !companies.includes(company))) {
    throw new HttpError(403, "That is another company's billing.");
  }
  return { session, company };
}

/** Clients in arrears and the reminder each would get on the next run. */
export async function GET(request: Request) {
  try {
    const { company } = await companyFor(request, "payments.view");
    return Response.json(await arrears(company), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Sends every reminder that's due now. */
export async function POST(request: Request) {
  try {
    const { session, company } = await companyFor(request, "reminders.manage");
    const result = await runReminders(company);
    await audit(session, {
      action: "reminders.run",
      company,
      detail: { sent: result.sent.filter((s) => s.ok).length, failed: result.sent.filter((s) => !s.ok).length },
    });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
