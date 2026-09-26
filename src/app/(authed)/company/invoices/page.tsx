import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyInvoices } from "@/features/finance/CompanyInvoices";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Invoices" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("statements.view")) return <NoAccess permission="statements.view" />;
  return <CompanyInvoices />;
}
