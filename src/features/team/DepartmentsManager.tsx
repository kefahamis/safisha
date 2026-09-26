"use client";

import { Building, Check, Lock, LockKeyhole, Plus, Save, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { assignableByGroup, permissionById } from "@/lib/auth/permissions";
import { companyById } from "@/lib/reference/companies";
import { useAppState } from "@/store/StoreProvider";
import { useTeam } from "./useTeam";

interface Draft {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
}

const blank: Draft = { name: "", description: "", permissions: [] };

/** A company's departments and what each may do. Members carry their department's permissions. */
export function DepartmentsManager() {
  const s = useAppState();
  const { data, error, send } = useTeam(s.companyId);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);

  const current = data?.departments.find((d) => d.id === selected);

  // Open the first department once they arrive.
  useEffect(() => {
    if (data && selected === null && data.departments[0]) {
      const d = data.departments[0];
      setSelected(d.id);
      setDraft({ id: d.id, name: d.name, description: d.description, permissions: d.permissions });
    }
  }, [data, selected]);

  if (!data) return <Page>{error ? <div className="banner">{error}</div> : <Empty icon={Building}>Loading departments…</Empty>}</Page>;

  const pick = (id: string) => {
    const d = data.departments.find((x) => x.id === id);
    if (!d) return;
    setSelected(id);
    setDraft({ id: d.id, name: d.name, description: d.description, permissions: [...d.permissions] });
  };
  const startNew = () => {
    setSelected("new");
    setDraft(blank);
  };

  const groups = assignableByGroup(data.assignable);
  // Permissions already on the department that this admin can't hand out themselves.
  const locked = draft.permissions.filter((p) => !data.assignable.includes(p));
  const saved = current ? current.permissions : [];
  const dirty =
    selected === "new" ||
    (current &&
      (draft.name !== current.name ||
        draft.description !== current.description ||
        draft.permissions.length !== saved.length ||
        draft.permissions.some((p) => !saved.includes(p))));
  const members = data.staff.filter((m) => m.departmentId === current?.id);

  const toggle = (id: string) =>
    setDraft((d) => ({ ...d, permissions: d.permissions.includes(id) ? d.permissions.filter((x) => x !== id) : [...d.permissions, id] }));

  const save = async () => {
    setBusy(true);
    const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
    const res = draft.id
      ? await send(`/departments/${draft.id}`, "PATCH", body, `${draft.name} saved${members.length ? ` · ${members.length} people affected` : ""}`)
      : await send("/departments", "POST", body, `${draft.name} created`);
    setBusy(false);
    if (res?.id) setSelected(String(res.id));
  };

  const remove = async () => {
    if (!current || !window.confirm(`Delete the ${current.name} department?`)) return;
    setBusy(true);
    const res = await send(`/departments/${current.id}`, "DELETE", undefined, `${current.name} deleted`);
    setBusy(false);
    if (res) setSelected(null);
  };

  return (
    <Page
      actions={
        <button type="button" className="btn primary" onClick={startNew}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          New department
        </button>
      }
    >
      <div className="access">
        <Panel title="Departments" icon={Building}>
          <div className="rolelist">
            {data.departments.map((d) => (
              <button key={d.id} type="button" className="rolerow" aria-current={selected === d.id} onClick={() => pick(d.id)}>
                <div className="row between" style={{ gap: 8 }}>
                  <b>{d.name}</b>
                  <Chip tone="neutral" icon={Users}>
                    {d.members}
                  </Chip>
                </div>
                <div className="hint">
                  {d.permissions.length} permission{d.permissions.length === 1 ? "" : "s"}
                  {d.description ? ` · ${d.description}` : ""}
                </div>
              </button>
            ))}
            {selected === "new" && (
              <div className="rolerow" aria-current="true">
                <b>{draft.name || "New department"}</b>
                <div className="hint">Not saved yet</div>
              </div>
            )}
            {!data.departments.length && selected !== "new" && <p className="hint">No departments yet.</p>}
          </div>
        </Panel>

        {selected ? (
          <div className="stack" style={{ gap: 20 }}>
            <Panel>
              <div className="dept-fields">
                <label className="f">
                  Name
                  <input maxLength={60} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Finance & billing" />
                </label>
                <label className="f">
                  What they do <span className="hint">(optional)</span>
                  <input
                    maxLength={200}
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                </label>
              </div>
              <div className="row between" style={{ marginTop: 14 }}>
                <span className="hint">
                  {draft.permissions.length} permission{draft.permissions.length === 1 ? "" : "s"} ·{" "}
                  {current ? `${members.length} member${members.length === 1 ? "" : "s"}` : "no members yet"}
                </span>
                <div className="row" style={{ gap: 8 }}>
                  {current && (
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={remove}
                      disabled={busy || members.length > 0}
                      title={members.length ? "Move its members to another department first" : undefined}
                    >
                      <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                  <button type="button" className="btn primary small" onClick={save} disabled={busy || !dirty || !draft.name.trim()}>
                    {dirty ? <Save size={14} strokeWidth={2.2} aria-hidden="true" /> : <Check size={14} strokeWidth={2.2} aria-hidden="true" />}
                    {busy ? "Saving…" : dirty ? (current ? "Save changes" : "Create department") : "Saved"}
                  </button>
                </div>
              </div>
              {locked.length > 0 && (
                <p className="hint with-ico" style={{ marginTop: 10 }}>
                  <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
                  Also carries {locked.map((p) => permissionById(p)?.label ?? p).join(", ")}, set by the platform admin.
                </p>
              )}
            </Panel>

            {groups.map(({ group, items }) => (
              <Panel key={group} title={group} icon={LockKeyhole}>
                <div className="permgrid">
                  {items.map((p) => (
                    <label className="perm" key={p.id}>
                      <input type="checkbox" checked={draft.permissions.includes(p.id)} onChange={() => toggle(p.id)} />
                      <div>
                        <div className="t">{p.label}</div>
                        <div className="hint">{p.detail}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Panel>
            ))}

            {current && (
              <Panel title="Members" icon={Users}>
                {members.length ? (
                  <div className="list">
                    {members.map((m) => (
                      <div className="li" key={m.id}>
                        <div>
                          <div className="t">{m.name}</div>
                          <div className="sub">{m.email}</div>
                        </div>
                        {m.suspended ? <Chip tone="bad">Suspended</Chip> : <Chip tone="ok">Active</Chip>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint">Nobody yet. Invite staff into this department from Staff.</p>
                )}
              </Panel>
            )}
          </div>
        ) : (
          <Panel>
            <Empty icon={Building}>Create a department to group your staff and choose what they can do.</Empty>
          </Panel>
        )}
      </div>
    </Page>
  );
}

function Page({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  const s = useAppState();
  return (
    <>
      <PageHead title="Departments" icon={Building} actions={actions}>
        {companyById(s.companyId).name}&rsquo;s teams. Everyone in a department can do what it allows; changes apply at once.
      </PageHead>
      {children}
    </>
  );
}
