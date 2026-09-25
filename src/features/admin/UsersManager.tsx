"use client";

import {
  Ban,
  CircleCheck,
  CircleSlash,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { useAppState } from "@/store/StoreProvider";
import { InviteForm } from "./InviteForm";
import { permissionsByGroup } from "@/lib/auth/permissions";
import type { PublicUser, RoleDef } from "@/lib/auth/types";
import { fmtDate, initials } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";

const GROUPS = permissionsByGroup();

type Override = "inherit" | "allow" | "deny";

/** Accounts, the role each holds, and per-person overrides on top of it. */
export function UsersManager({
  users: initialUsers,
  roles,
  currentUserId,
}: {
  users: PublicUser[];
  roles: RoleDef[];
  currentUserId: string;
}) {
  const toast = useToast();
  const s = useAppState();
  const [users, setUsers] = useState(initialUsers);
  const [openId, setOpenId] = useState<string | null>(null);

  const roleOf = (id: string) => roles.find((r) => r.id === id);

  const patch = async (userId: string, body: Record<string, unknown>, note: string) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return false;
    }
    setUsers((us) => us.map((u) => (u.id === data.user.id ? data.user : u)));
    toast(note);
    return true;
  };

  return (
    <>
      <PageHead title="Users" icon={Users}>
        Every account, the role it holds, and any permission granted or withheld for that person
        alone. A deny always beats the role.
      </PageHead>

      <InviteForm roles={roles} trucks={s.trucks} />

      <Panel>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Overrides</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const role = roleOf(u.roleId);
                const self = u.id === currentUserId;
                const overrides = u.grants.length + u.denies.length;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="li-main">
                        <span className="avatar sm" aria-hidden="true">
                          {initials(u.name)}
                        </span>
                        <span>
                          {u.name}
                          {self && <span className="hint"> · you</span>}
                          <div className="hint mono">{u.email}</div>
                        </span>
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.roleId}
                        disabled={self}
                        onChange={(e) =>
                          patch(
                            u.id,
                            { roleId: e.target.value },
                            `${u.name} is now a ${roleOf(e.target.value)?.name}`,
                          )
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <div className="hint">{role?.workspace} workspace</div>
                    </td>
                    <td className="hint">
                      {u.scope.companyId && <div>{companyById(u.scope.companyId).name}</div>}
                      {u.scope.clientId && <div className="mono">{u.scope.clientId}</div>}
                      {u.scope.truckId && <div className="mono">{u.scope.truckId}</div>}
                      {!u.scope.companyId && !u.scope.clientId && !u.scope.truckId && (
                        <div>Platform-wide</div>
                      )}
                    </td>
                    <td>
                      {overrides === 0 ? (
                        <span className="hint">None</span>
                      ) : (
                        <span className="row" style={{ gap: 6 }}>
                          {u.grants.length > 0 && (
                            <Chip tone="ok" icon={Plus}>
                              {u.grants.length}
                            </Chip>
                          )}
                          {u.denies.length > 0 && (
                            <Chip tone="bad" icon={Minus}>
                              {u.denies.length}
                            </Chip>
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      {u.suspended ? (
                        <Chip tone="bad" icon={Ban}>
                          Suspended
                        </Chip>
                      ) : (
                        <Chip tone="ok" icon={CircleCheck}>
                          Active
                        </Chip>
                      )}
                    </td>
                    <td className="hint num">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setOpenId(openId === u.id ? null : u.id)}
                        >
                          {openId === u.id ? (
                            <X size={14} strokeWidth={2.2} aria-hidden="true" />
                          ) : (
                            <SlidersHorizontal size={14} strokeWidth={2.2} aria-hidden="true" />
                          )}
                          {openId === u.id ? "Close" : "Overrides"}
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={self}
                          onClick={() =>
                            patch(
                              u.id,
                              { suspended: !u.suspended },
                              u.suspended ? `${u.name} restored` : `${u.name} suspended`,
                            )
                          }
                        >
                          {u.suspended ? (
                            <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                          ) : (
                            <Ban size={14} strokeWidth={2.2} aria-hidden="true" />
                          )}
                          {u.suspended ? "Restore" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {openId && (
        <OverrideEditor
          key={openId}
          user={users.find((u) => u.id === openId)!}
          role={roleOf(users.find((u) => u.id === openId)!.roleId)}
          onSave={(grants, denies, name) =>
            patch(openId, { grants, denies }, `Overrides saved for ${name}`)
          }
        />
      )}
    </>
  );
}

function OverrideEditor({
  user,
  role,
  onSave,
}: {
  user: PublicUser;
  role: RoleDef | undefined;
  onSave: (grants: string[], denies: string[], name: string) => Promise<boolean>;
}) {
  const initial = (id: string): Override =>
    user.denies.includes(id) ? "deny" : user.grants.includes(id) ? "allow" : "inherit";

  const [state, setState] = useState<Record<string, Override>>(() => {
    const map: Record<string, Override> = {};
    for (const { items } of GROUPS) for (const p of items) map[p.id] = initial(p.id);
    return map;
  });
  const [busy, setBusy] = useState(false);

  const roleHas = (id: string) => role?.permissions.includes(id) ?? false;
  const effective = (id: string) =>
    state[id] === "deny" ? false : state[id] === "allow" ? true : roleHas(id);

  const save = async () => {
    setBusy(true);
    try {
      const grants = Object.keys(state).filter((id) => state[id] === "allow");
      const denies = Object.keys(state).filter((id) => state[id] === "deny");
      await onSave(grants, denies, user.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="with-ico">
            <SlidersHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
            Overrides · {user.name}
          </h3>
          <div className="hint">
            Inherit follows the {role?.name ?? user.roleId} role. Allow adds a permission for this
            person; deny takes it away even if the role carries it.
          </div>
        </div>
        <button type="button" className="btn primary small" onClick={save} disabled={busy}>
          <Save size={14} strokeWidth={2.2} aria-hidden="true" />
          {busy ? "Saving…" : "Save overrides"}
        </button>
      </div>

      {GROUPS.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <div className="label with-ico" style={{ marginBottom: 6 }}>
            <LockKeyhole size={13} strokeWidth={2.2} aria-hidden="true" />
            {group}
          </div>
          <div className="list">
            {items.map((p) => (
              <div className="li" key={p.id}>
                <div>
                  <div className="t">{p.label}</div>
                  <div className="sub">
                    <code className="permid">{p.id}</code> · role{" "}
                    {roleHas(p.id) ? "grants this" : "does not grant this"}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Chip
                    tone={effective(p.id) ? "ok" : "neutral"}
                    icon={effective(p.id) ? CircleCheck : CircleSlash}
                  >
                    {effective(p.id) ? "Allowed" : "Blocked"}
                  </Chip>
                  <select
                    aria-label={`${p.label} for ${user.name}`}
                    value={state[p.id]}
                    onChange={(e) =>
                      setState((s) => ({ ...s, [p.id]: e.target.value as Override }))
                    }
                  >
                    <option value="inherit">Inherit</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
