import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { ClientPickups } from "@/features/client/ClientPickups";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Book a pickup" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("pickups.request")) return <NoAccess permission="pickups.request" />;
  return <ClientPickups />;
}
