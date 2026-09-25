import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { ClientReport } from "@/features/client/ClientReport";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Report dumping" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("dumping.report")) return <NoAccess permission="dumping.report" />;
  return <ClientReport />;
}
