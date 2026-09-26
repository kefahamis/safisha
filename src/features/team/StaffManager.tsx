"use client";

import { ChevronDown, CircleCheck, LockKeyhole, Mail, Send, Truck, UserCog, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { CopyButton } from "@/components/ui/CopyButton";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { assignableByGroup } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import type { StaffMember, TeamBundle } from "@/lib/team";
import { useAppState } from "@/store/StoreProvider";
import { FormSheet } from "../fleet/FleetForms";
import { useTeam } from "./useTeam";

export function StaffManager() {
  const s = useAppState();
  const { data, error, send } = useTeam(s.companyId);
  const [editing, setEditing] = useState<string | null>(null);

  const head = (
    <PageHead title="Staff" icon={Users}>
      Everyone who works for {companyById(s.companyId).name}. Staff do what their department allows, plus anything you add
      or remove for them here.
    </PageHead>
  );
  if (!data) return <>{head}{error ? <div className="banner">{error}</div> : <Empty icon={Users}>Loading staff…</Empty>}</>;

  const deptName = (id?: string) => data.departments.find((d) => d.id === id)?.name;
  const office = data.staff.filter((m) => m.workspace === "company");
  const drivers = data.staff.filter((m) => m.workspace === "collector");
  const member = data.staff.find((m) => m.id === editing);

  return (
    <>
      {head}
      <InviteStaff data={data} send={send} />

      <Panel title="Office staff" icon={Users} aside={<span className="chip neutral">{office.length}</span>}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Access</th>
                <th>Last signed in</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {office.map((m) => (
                <tr key={m.id} className={m.editable ? "click" : undefined} onClick={m.editable ? () => setEditing(m.id) : undefined}>
                  <td>
                    <div className="t">{m.name}</div>
                    <div className="hint">{m.email}</div>
                  </td>
                  <td>{deptName(m.departmentId) ?? <span className="hint">—</span>}</td>
                  <td>
                    <span className="hint">{m.roleName}</span>
                    {(m.grants.length > 0 || m.denies.length > 0) && (
                      <div className="hint">
                        {m.grants.length ? `+${m.grants.length} added` : ""}
                        {m.grants.length && m.denies.length ? " · " : ""}
                        {m.denies.length ? `−${m.denies.length} removed` : ""}
                      </div>
                    )}
                  </td>
                  <td>{m.lastLoginAt ? fmtDate(m.lastLoginAt) : <span className="hint">Never</span>}</td>
                  <td>{m.suspended ? <Chip tone="bad">Suspended</Chip> : <Chip tone="ok">Active</Chip>}</td>
                  <td className="r">
                    {m.editable ? (
                      <button type="button" className="btn small ghost">
                        <UserCog size={14} strokeWidth={2.2} aria-hidden="true" />
                        Manage
                      </button>
                    ) : (
                      <span className="hint">{m.roleName === "Company admin" ? "Company admin" : "You"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {drivers.length > 0 && (
        <Panel title="Drivers" icon={Truck}>
          <div className="list">
            {drivers.map((m) => (
              <div className="li" key={m.id}>
                <div>
                  <div className="t">{m.name}</div>
                  <div className="sub">
                    {m.email}
                    {m.truckId ? ` · ${m.truckId}` : ""}
                  </div>
                </div>
                <Link href="/company/fleet" className="btn small ghost">
                  In Fleet management
                </Link>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {member && <StaffSheet member={member} data={data} send={send} onClose={() => setEditing(null)} />}
    </>
  );
}

type Send = ReturnType<typeof useTeam>["send"];

function InviteStaff({ data, send }: { data: TeamBundle; send: Send }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLink(null);
    const res = await send("/staff", "POST", { name, email, phone: phone || undefined, departmentId }, `Invitation for ${name} ready`);
    setBusy(false);
    if (!res) return;
    // Without a public address set, the server hands back a path; make it a link they can send.
    if (res.link) setLink(new URL(String(res.link), window.location.origin).toString());
    setName("");
    setEmail("");
    setPhone("");
  };

  return (
    <details className="panel">
      <summary>
        <span className="summary-ico" aria-hidden="true">
          <UserPlus size={17} strokeWidth={2.2} aria-hidden="true" />
        </span>
        Invite a staff member
        <ChevronDown size={17} strokeWidth={2.2} className="chev" aria-hidden="true" />
      </summary>
      {data.departments.length ? (
        <form className="form" style={{ marginTop: 14 }} onSubmit={submit}>
          <label className="f">
            Full name
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="f">
            Email
            <input required type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="f">
            Phone <span className="hint">(optional)</span>
            <input inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="f">
            Department
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" disabled={busy}>
            <Send size={16} strokeWidth={2.2} aria-hidden="true" />
            Send invitation
          </button>
        </form>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          Create a department first, under <Link href="/company/departments">Departments</Link>.
        </p>
      )}
      {link && (
        <div className="banner" style={{ marginTop: 12 }}>
          <Mail size={17} strokeWidth={2.2} aria-hidden="true" />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            Email isn&rsquo;t connected, so send them this link to set their password (valid 7 days): <span className="mono">{link}</span>
          </span>
          <CopyButton value={link} />
        </div>
      )}
    </details>
  );
}

/**
 * One person's access: their department's permissions come ticked; untick to
 * take one away from just them, tick an extra to add it for just them.
 */
function StaffSheet({ member, data, send, onClose }: { member: StaffMember; data: TeamBundle; send: Send; onClose: () => void }) {
  const [departmentId, setDepartmentId] = useState(member.departmentId ?? "");
  const [grants, setGrants] = useState(member.grants.filter((p) => data.assignable.includes(p)));
  const [denies, setDenies] = useState(member.denies.filter((p) => data.assignable.includes(p)));
  const [busy, setBusy] = useState(false);

  const dept = data.departments.find((d) => d.id === departmentId);
  const inherited = new Set([...member.rolePermissions, ...(dept?.permissions ?? [])]);
  const has = (p: string) => (inherited.has(p) ? !denies.includes(p) : grants.includes(p));
  const toggle = (p: string) => {
    if (inherited.has(p)) setDenies((d) => (d.includes(p) ? d.filter((x) => x !== p) : [...d, p]));
    else setGrants((g) => (g.includes(p) ? g.filter((x) => x !== p) : [...g, p]));
  };
  const count = data.assignable.filter(has).length;

  const save = async () => {
    setBusy(true);
    const ok = await send(
      `/staff/${member.id}`,
      "PATCH",
      {
        departmentId,
        // Only keep overrides that still mean something under the chosen department.
        grants: grants.filter((p) => !inherited.has(p)),
        denies: denies.filter((p) => inherited.has(p)),
      },
      `${member.name} updated`,
    );
    setBusy(false);
    if (ok) onClose();
  };

  const suspend = async () => {
    if (!member.suspended && !window.confirm(`Suspend ${member.name}? They'll be signed out and can't sign in until reactivated.`)) return;
    setBusy(true);
    const ok = await send(`/staff/${member.id}`, "PATCH", { suspended: !member.suspended }, member.suspended ? `${member.name} reactivated` : `${member.name} suspended`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <FormSheet
      title={member.name}
      icon={<UserCog size={19} strokeWidth={2.2} aria-hidden="true" />}
      wide
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className={`btn ${member.suspended ? "" : "ghost danger-text"}`} onClick={suspend} disabled={busy}>
            {member.suspended ? "Reactivate" : "Suspend"}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            Save
          </button>
        </>
      }
    >
      <p className="hint">
        {member.email}
        {member.phone ? ` · ${member.phone}` : ""} · {member.roleName}
      </p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Department
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">No department</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        {count} permission{count === 1 ? "" : "s"}. Ticked ones marked “department” come from {dept?.name ?? "their role"}; untick to
        take them away from {member.name.split(" ")[0]} only.
      </p>

      {assignableByGroup(data.assignable).map(({ group, items }) => (
        <div key={group} className="staff-perm-group">
          <div className="label with-ico">
            <LockKeyhole size={13} strokeWidth={2.2} aria-hidden="true" />
            {group}
          </div>
          <div className="permgrid">
            {items.map((p) => {
              const from = inherited.has(p.id);
              const on = has(p.id);
              return (
                <label className="perm" key={p.id}>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                  <div>
                    <div className="t">{p.label}</div>
                    <div className="hint">
                      {from ? (on ? "From department" : "Removed for them") : on ? "Added for them" : p.detail}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </FormSheet>
  );
}
