import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyImpact } from "@/features/company/CompanyImpact";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Recycling · Zoa" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("clients.view")) return <NoAccess permission="clients.view" />;
  return <CompanyImpact />;
}
