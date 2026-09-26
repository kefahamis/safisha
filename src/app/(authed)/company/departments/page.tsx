import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { DepartmentsManager } from "@/features/team/DepartmentsManager";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Departments" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("staff.manage")) return <NoAccess permission="staff.manage" />;
  return <DepartmentsManager />;
}
