import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { AuditLog } from "@/features/shared/AuditLog";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Audit log · Zoa" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("audit.view")) return <NoAccess permission="audit.view" />;
  return <AuditLog />;
}
