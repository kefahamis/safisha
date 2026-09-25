import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { FinanceCenter } from "@/features/finance/FinanceCenter";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Financial reports" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("finance.view")) return <NoAccess permission="finance.view" />;
  return <FinanceCenter />;
}
