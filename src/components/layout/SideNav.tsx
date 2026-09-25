"use client";

import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { navFor } from "@/lib/navigation";
import { openTicketCount } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";

/** The dark rail: brand, the sections this session may open, and a footnote. */
export function SideNav({ role, pathname }: { role: Role; pathname: string }) {
  const s = useAppState();
  const { session } = useSession();

  const items = navFor(role, session?.permissions ?? []);

  const openTickets =
    role === "company"
      ? openTicketCount(s, (t) => t.company === s.companyId)
      : role === "client"
        ? openTicketCount(s, (t) => t.client === s.clientId)
        : 0;

  return (
    <nav className="side" aria-label="Sections">
      <Link href="/" className="brand" prefetch={false}>
        <span className="mark" aria-hidden="true" />
        <div>
          <b>Safisha</b>
          <small>Waste Hub</small>
        </div>
      </Link>

      <div className="nav-items">
        {items.map((item) => (
          <Link
            key={item.href}
            className="nav-item"
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            prefetch={false}
          >
            {item.label}
            {item.badge === "tickets" && openTickets > 0 && (
              <span className="count">{openTickets}</span>
            )}
          </Link>
        ))}
      </div>

      <div className="foot">Demo data. M-Pesa calls are simulated; no money moves.</div>
    </nav>
  );
}
