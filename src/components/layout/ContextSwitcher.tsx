"use client";

import { useSession } from "@/components/auth/SessionProvider";
import { COMPANIES, companyById } from "@/lib/reference/companies";
import { clientById, truckById } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

/**
 * What the session is scoped to. A client is their own account and a driver
 * their own truck, so these are read-only; only a platform admin, who is scoped
 * to no single company, gets a picker.
 */
export function ContextSwitcher({ role }: { role: Role }) {
  const s = useAppState();
  const actions = useActions();
  const { session } = useSession();

  if (!session) return null;

  if (role === "client") {
    const client = clientById(s, s.clientId);
    if (!client) return null;
    return (
      <div className="ctx">
        <span className="chip neutral">
          {client.name} · <span className="mono">{client.id}</span>
        </span>
      </div>
    );
  }

  if (role === "collector") {
    const truck = truckById(s, s.truckId);
    if (!truck) return null;
    return (
      <div className="ctx">
        <span className="chip neutral">
          <span className="mono">{truck.id}</span> · {truck.driver}
        </span>
      </div>
    );
  }

  if (role === "company") {
    // Scoped company users are pinned; a platform admin may look across them.
    if (session.scope.companyId) {
      return (
        <div className="ctx">
          <span className="chip neutral">{companyById(session.scope.companyId).name}</span>
        </div>
      );
    }
    return (
      <div className="ctx">
        <select
          aria-label="Company"
          value={s.companyId}
          onChange={(e) => actions.selectCompany(e.target.value)}
        >
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="ctx">
      <span className="chip neutral">Platform admin · all companies</span>
    </div>
  );
}
