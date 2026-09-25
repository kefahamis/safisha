import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/NoAccess";
import { SettingsCenter } from "@/features/settings/SettingsCenter";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  const session = await getSession();
  if (!session?.permissions.includes("settings.platform.manage")) return <NoAccess permission="settings.platform.manage" />;
  return (
    <SettingsCenter
      platform={session.permissions.includes("settings.platform.manage")}
      companyId={session.scope.companyId}
    />
  );
}
