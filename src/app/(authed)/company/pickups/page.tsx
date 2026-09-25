import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyPickups } from "@/features/company/CompanyPickups";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Pickup requests · Zoa" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("pickups.manage")) return <NoAccess permission="pickups.manage" />;
  return <CompanyPickups />;
}
