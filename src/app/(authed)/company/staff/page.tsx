import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { StaffManager } from "@/features/team/StaffManager";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("staff.manage")) return <NoAccess permission="staff.manage" />;
  return <StaffManager />;
}
