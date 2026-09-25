import { PageHead } from "@/components/ui/Panel";

/** Shown when a route renders but the session lacks the permission behind it. */
export function NoAccess({ permission }: { permission: string }) {
  return (
    <>
      <PageHead title="No access">
        This section needs the <span className="mono">{permission}</span> permission. Ask a
        platform admin to grant it to your role.
      </PageHead>
      <div className="empty">Nothing to show here.</div>
    </>
  );
}
