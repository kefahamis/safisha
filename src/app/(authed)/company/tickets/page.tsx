import type { Metadata } from "next";
import { Suspense } from "react";
import { NeedsPackage } from "@/components/auth/NeedsPackage";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyTickets } from "@/features/company/CompanyTickets";
import { hasFeature } from "@/server/packages";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Tickets" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("tickets.view.company")) return <NoAccess permission="tickets.view.company" />;
  if (session.scope.companyId && !(await hasFeature(session.scope.companyId, "tickets"))) {
    return <NeedsPackage title="Tickets" feature="tickets" canSubscribe={session.permissions.includes("settings.company.manage")} />;
  }
  // The open ticket lives in the URL (?id=), read on the client.
  return (
    <Suspense>
      <CompanyTickets />
    </Suspense>
  );
}
