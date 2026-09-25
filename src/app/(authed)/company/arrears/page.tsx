import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyArrears } from "@/features/company/CompanyArrears";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Arrears & reminders · Zoa" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("payments.view")) return <NoAccess permission="payments.view" />;
  return <CompanyArrears />;
}
