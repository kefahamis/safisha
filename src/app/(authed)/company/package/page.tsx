import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CarePackage } from "@/features/company/CarePackage";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Care package" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("settings.company.manage") || !session.scope.companyId) {
    return <NoAccess permission="settings.company.manage" />;
  }
  return <CarePackage companyId={session.scope.companyId} />;
}
