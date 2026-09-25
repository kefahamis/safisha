"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { permissionsByGroup, PERMISSION_IDS } from "@/lib/auth/permissions";
import { WORKSPACES, type RoleDef, type Workspace } from "@/lib/auth/types";

const GROUPS = permissionsByGroup();

/** Roles and the permission matrix behind them. */
export function RolesManager({
  roles: initialRoles,
  usage,
}: {
  roles: RoleDef[];
  usage: Record<string, number>;
}) {
  const toast = useToast();
  const [roles, setRoles] = useState(initialRoles);
  const [counts, setCounts] = useState(usage);
  const [selectedId, setSelectedId] = useState(initialRoles[0]?.id ?? "");
  const [draft, setDraft] = useState<string[]>(initialRoles[0]?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const selected = roles.find((r) => r.id === selectedId);
  const dirty =
    !!selected &&
    (draft.length !== selected.permissions.length ||
      draft.some((p) => !selected.permissions.includes(p)));

  const select = (role: RoleDef) => {
    setSelectedId(role.id);
    setDraft([...role.permissions]);
  };

  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not save.");
        return;
      }
      setRoles((rs) => rs.map((r) => (r.id === data.role.id ? data.role : r)));
      setDraft(data.role.permissions);
      const holders = counts[selected.id] ?? 0;
      toast(
        holders
          ? `${selected.name} updated · ${holders} user${holders === 1 ? "" : "s"} affected`
          : `${selected.name} updated`,
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/roles/${selected.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not delete.");
        return;
      }
      const left = roles.filter((r) => r.id !== selected.id);
      setRoles(left);
      if (left[0]) select(left[0]);
      toast(`${selected.name} deleted`);
    } finally {
      setBusy(false);
    }
  };

  const onCreated = (role: RoleDef) => {
    setRoles((rs) => [...rs, role]);
    setCounts((c) => ({ ...c, [role.id]: 0 }));
    select(role);
    setCreating(false);
    toast(`${role.name} created`);
  };

  return (
    <>
      <PageHead
        title="Roles & permissions"
        actions={
          <button type="button" className="btn primary" onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New role"}
          </button>
        }
      >
        A role is a named bundle of permissions. Changing one takes effect on the next request for
        everyone holding it — no re-login needed.
      </PageHead>

      {creating && <NewRoleForm onCreated={onCreated} onError={toast} />}

      <div className="access">
        <Panel title="Roles">
          <div className="rolelist">
            {roles.map((r) => (
              <button
                type="button"
                key={r.id}
                className="rolerow"
                aria-current={r.id === selectedId}
                onClick={() => select(r)}
              >
                <div className="row between" style={{ gap: 8 }}>
                  <b>{r.name}</b>
                  <Chip tone={r.system ? "neutral" : "ok"}>{r.system ? "Built-in" : "Custom"}</Chip>
                </div>
                <div className="hint">
                  {r.workspace} workspace · {r.permissions.length} permissions ·{" "}
                  {counts[r.id] ?? 0} user{(counts[r.id] ?? 0) === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="stack" style={{ gap: 20 }}>
          {!selected ? (
            <div className="empty">Pick a role to edit its permissions.</div>
          ) : (
            <>
              <Panel>
                <div className="row between">
                  <div>
                    <h3>{selected.name}</h3>
                    <div className="hint">{selected.description}</div>
                  </div>
                  <div className="row">
                    <span className="hint">
                      {draft.length} of {PERMISSION_IDS.length} selected
                    </span>
                    {!selected.system && (
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={remove}
                        disabled={busy}
                      >
                        Delete role
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={save}
                      disabled={busy || !dirty}
                    >
                      {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                    </button>
                  </div>
                </div>
              </Panel>

              {GROUPS.map(({ group, items }) => (
                <Panel key={group} title={group}>
                  <div className="permgrid">
                    {items.map((p) => (
                      <label className="perm" key={p.id}>
                        <input
                          type="checkbox"
                          checked={draft.includes(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                        <div>
                          <div className="t">{p.label}</div>
                          <div className="hint">{p.detail}</div>
                          <code className="permid">{p.id}</code>
                        </div>
                      </label>
                    ))}
                  </div>
                </Panel>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function NewRoleForm({
  onCreated,
  onError,
}: {
  onCreated: (role: RoleDef) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>("company");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, workspace, permissions: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Could not create the role.");
        return;
      }
      onCreated(data.role);
      setName("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="New role">
      <form className="form" onSubmit={submit}>
        <label className="f">
          Name
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="f">
          Description
          <input
            maxLength={90}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="f">
          Workspace
          <select value={workspace} onChange={(e) => setWorkspace(e.target.value as Workspace)}>
            {WORKSPACES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "Creating…" : "Create role"}
        </button>
      </form>
      <p className="hint">
        The role starts with no permissions. Pick them on the matrix once it is created.
      </p>
    </Panel>
  );
}
