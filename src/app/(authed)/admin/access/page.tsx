import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { RolesManager } from "@/features/admin/RolesManager";
import { listRoles, roleUsage } from "@/server/accessStore";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Roles & permissions · Zoa" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("access.roles.manage")) {
    return <NoAccess permission="access.roles.manage" />;
  }

  return <RolesManager roles={await listRoles()} usage={await roleUsage()} />;
}
