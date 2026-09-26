import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { CollectorVehicle } from "@/features/collector/CollectorVehicle";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "My truck" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("fleet.inspect")) return <NoAccess permission="fleet.inspect" />;
  return <CollectorVehicle />;
}
