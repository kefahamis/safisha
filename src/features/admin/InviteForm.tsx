"use client";

import { CircleCheck, LoaderCircle, Mail, Send, UserPlus } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import type { RoleDef } from "@/lib/auth/types";
import { COMPANIES } from "@/lib/reference/companies";

/**
 * Invites a staff member by email. They follow the link to choose their own
 * password; nobody else ever sees it. Without email connected, the link is
 * shown here to pass on another way.
 */
export function InviteForm({ roles, trucks }: { roles: RoleDef[]; trucks: { id: string; company: string }[] }) {
  const staffRoles = roles.filter((r) => r.workspace !== "client");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState(staffRoles.find((r) => r.id === "company_agent")?.id ?? staffRoles[0]?.id ?? "");
  const [companyId, setCompanyId] = useState(COMPANIES[0]?.id ?? "");
  const [truckId, setTruckId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const role = staffRoles.find((r) => r.id === roleId);
  const needsCompany = role?.workspace === "company" || role?.workspace === "collector";
  const needsTruck = role?.workspace === "collector";
  const companyTrucks = trucks.filter((t) => t.company === companyId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          phone: phone || undefined,
          roleId,
          companyId: needsCompany ? companyId : undefined,
          truckId: needsTruck ? truckId || companyTrucks[0]?.id : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: body.error ?? "Could not send the invitation." });
        return;
      }
      setResult({
        ok: true,
        text: body.emailed ? `Invitation emailed to ${email}.` : "Email isn't connected, so share this link with them:",
        link: body.link,
      });
      setEmail("");
      setName("");
      setPhone("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="panel">
      <summary>
        <span className="summary-ico" aria-hidden="true">
          <UserPlus size={17} strokeWidth={2.2} />
        </span>
        Invite someone
      </summary>
      <form className="form" style={{ marginTop: 14 }} onSubmit={submit}>
        <label className="f">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="f">
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="f">
          Phone (for SMS sign-in)
          <input inputMode="tel" placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="f">
          Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {staffRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {needsCompany && (
          <label className="f">
            Company
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsTruck && (
          <label className="f">
            Truck
            <select value={truckId || companyTrucks[0]?.id} onChange={(e) => setTruckId(e.target.value)}>
              {companyTrucks.map((t) => (
                <option key={t.id}>{t.id}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? (
            <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
          ) : (
            <Send size={16} strokeWidth={2.2} aria-hidden="true" />
          )}
          Send invitation
        </button>
      </form>
      {result && (
        <div className={`result ${result.ok ? "ok" : "bad"}`} style={{ marginTop: 12, flexWrap: "wrap" }}>
          {result.ok ? <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" /> : <Mail size={16} strokeWidth={2.2} aria-hidden="true" />}
          {result.text}
          {result.link && (
            <span className="row" style={{ gap: 6, width: "100%" }}>
              <code className="mono" style={{ wordBreak: "break-all", flex: 1 }}>
                {result.link}
              </code>
              <CopyButton value={result.link} className="btn small" label="Copy link" />
            </span>
          )}
        </div>
      )}
    </details>
  );
}
