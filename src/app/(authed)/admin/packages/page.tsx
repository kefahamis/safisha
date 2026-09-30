import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { PackagesManager } from "@/features/admin/PackagesManager";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Care packages" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("platform.companies.manage")) return <NoAccess permission="platform.companies.manage" />;
  return <PackagesManager />;
}
