// Server-only. Who may read or change which settings scope.
import type { Session } from "@/lib/auth/types";
import { integrationDef, type IntegrationKey } from "@/lib/integrations";
import { COMPANIES } from "@/lib/reference/companies";
import { HttpError, requireSession } from "./session";

/**
 * "platform" needs the platform permission. A company id needs the company
 * permission and that company in scope — or the platform permission, which
 * covers every company.
 */
export async function requireSettingsScope(scope: string, key?: string): Promise<Session> {
  const session = await requireSession();
  const platform = session.permissions.includes("settings.platform.manage");

  if (key !== undefined) {
    const def = integrationDef(key);
    if (!def) throw new HttpError(404, "Unknown integration.");
    if ((def.scope === "platform") !== (scope === "platform")) {
      throw new HttpError(400, `${def.title} is a ${def.scope} setting.`);
    }
  }

  if (scope === "platform") {
    if (!platform) throw new HttpError(403, "Missing permission: settings.platform.manage");
    return session;
  }

  if (!COMPANIES.some((c) => c.id === scope)) throw new HttpError(404, "Unknown company.");
  if (platform) return session;
  if (!session.permissions.includes("settings.company.manage")) {
    throw new HttpError(403, "Missing permission: settings.company.manage");
  }
  if (session.scope.companyId !== scope) throw new HttpError(403, "That is another company's settings.");
  return session;
}

export const asKey = (key: string) => key as IntegrationKey;
