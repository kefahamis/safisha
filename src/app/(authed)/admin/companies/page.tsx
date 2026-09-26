import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompaniesManager } from "@/features/admin/CompaniesManager";
import { referenceOverview } from "@/server/reference";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Companies & estates" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("platform.companies.manage")) {
    return <NoAccess permission="platform.companies.manage" />;
  }
  return <CompaniesManager data={await referenceOverview()} />;
}
