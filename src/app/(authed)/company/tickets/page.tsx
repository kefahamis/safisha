import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/auth/NoAccess";
import { CompanyTickets } from "@/features/company/CompanyTickets";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Tickets" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("tickets.view.company")) return <NoAccess permission="tickets.view.company" />;
  // The open ticket lives in the URL (?id=), read on the client.
  return (
    <Suspense>
      <CompanyTickets />
    </Suspense>
  );
}
