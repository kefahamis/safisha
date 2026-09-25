"use client";

import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { landingFor, ROLES } from "@/lib/navigation";
import type { Role } from "@/lib/types";

/**
 * Only the dashboards this session is allowed to open. Most accounts have
 * exactly one, so nothing renders; a platform admin also gets the company view,
 * which is what the overview table drills into.
 */
export function RoleTabs({ active }: { active: Role }) {
  const { session } = useSession();
  if (!session) return null;

  const tabs = ROLES.filter((r) => session.allowed.includes(r.role));
  if (tabs.length < 2) return null;

  return (
    <div className="roles" role="tablist" aria-label="Workspace">
      {tabs.map(({ role, label }) => (
        <Link
          key={role}
          href={landingFor(role, session.permissions)}
          role="tab"
          aria-selected={role === active}
          prefetch={false}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
