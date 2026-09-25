import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { UsersManager } from "@/features/admin/UsersManager";
import { listRoles, listUsers } from "@/server/accessStore";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Users" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("access.users.manage")) {
    return <NoAccess permission="access.users.manage" />;
  }

  return (
    <UsersManager users={await listUsers()} roles={await listRoles()} currentUserId={session.sub} />
  );
}
