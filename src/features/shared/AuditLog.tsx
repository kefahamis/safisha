"use client";

import { ScrollText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";

interface Entry {
  id: number;
  at: string;
  actorName: string;
  company: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
}

const ACTION: Record<string, string> = {
  "settings.save": "Changed settings",
  "settings.test.pass": "Connection test passed",
  "settings.test.fail": "Connection test failed",
  "mpesa.register_urls": "Registered Paybill URLs",
  "role.create": "Created role",
  "role.permissions": "Changed role permissions",
  "role.delete": "Deleted role",
  "user.update": "Changed user",
  "user.invite": "Invited user",
  "user.invite.accept": "Accepted invitation",
  "client.create": "Registered client",
  "payment.reconcile": "Matched suspense payment",
  "reminders.run": "Sent billing reminders",
  "billing.cycle": "Ran billing cycle",
  "dump.update": "Updated dumping report",
  "journal.post": "Posted journal entry",
  "journal.reverse": "Reversed journal entry",
  "branding.update": "Updated branding",
  "branding.reset": "Reset branding",
  "user.signin": "Signed in",
  "invoice.send": "Sent invoice",
  "staff.invite": "Invited staff",
  "staff.update": "Changed staff access",
  "department.create": "Created department",
  "department.update": "Changed department",
  "department.delete": "Deleted department",
  "fleet.workorder.open": "Opened work order",
  "fleet.workorder.update": "Updated work order",
  "fleet.document": "Recorded fleet document",
  "fleet.vehicle": "Changed vehicle",
  "fleet.assign": "Assigned driver",
  "fleet.settings": "Changed fleet rules",
  "fleet.incident": "Reported incident",
  "fleet.incident.close": "Closed incident",
};

/** Summarises the detail object without dumping raw JSON on people. */
function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function AuditLog() {
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [platformWide, setPlatformWide] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/audit?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const body = await res.json();
      setEntries(body.entries ?? []);
      setPlatformWide(Boolean(body.platformWide));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHead title="Audit log" icon={ScrollText}>
        Who changed settings, access, clients and payments. {platformWide ? "Every company." : "Your company only."} Key
        values are never recorded, only which fields changed.
      </PageHead>
      <Panel>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="search" style={{ flex: 1, minWidth: 180 }}>
            <Search size={16} strokeWidth={2.2} aria-hidden="true" />
            <input type="search" placeholder="Search action, person, target or IP" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {entries === null ? (
          <Empty icon={ScrollText}>Loading…</Empty>
        ) : entries.length === 0 ? (
          <Empty icon={ScrollText}>Nothing recorded yet.</Empty>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="hint num" style={{ whiteSpace: "nowrap" }}>
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td>{e.actorName}</td>
                    <td>{ACTION[e.action] ?? e.action}</td>
                    <td className="mono">{e.target ?? "—"}</td>
                    <td className="hint" style={{ maxWidth: 420 }}>
                      {describe(e.detail)}
                    </td>
                    <td className="mono hint" style={{ whiteSpace: "nowrap" }} title={e.ip ?? undefined}>
                      {e.ip === "::1" || e.ip === "127.0.0.1" ? "This computer" : (e.ip ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
