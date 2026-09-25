import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { DumpingReports } from "@/features/shared/DumpingReports";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Dumping reports" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("dumping.manage")) return <NoAccess permission="dumping.manage" />;
  return <DumpingReports />;
}
