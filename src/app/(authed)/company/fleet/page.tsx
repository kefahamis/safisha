import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { FleetCenter } from "@/features/fleet/FleetCenter";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Fleet management" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("fleet.manage")) return <NoAccess permission="fleet.manage" />;
  return <FleetCenter />;
}
