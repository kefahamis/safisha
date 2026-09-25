"use client";

import { Circle, FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { NAV_ICONS } from "@/components/ui/icons";
import { useT } from "@/lib/i18n";
import { navFor } from "@/lib/navigation";
import { openTicketCount } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";
import { BrandMark } from "./BrandMark";

/** The dark rail: brand, the sections this session may open, and a footnote. */
export function SideNav({ role, pathname }: { role: Role; pathname: string }) {
  const s = useAppState();
  const { session } = useSession();
  const { t } = useT();
  // Demo only while every company in view still pays through the simulator.
  const live = Object.values(s.integrations.mpesa).some((m) => m.mode === "live");

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
        <BrandMark />
        <div>
          <b>Zoa</b>
          <small>Waste Hub</small>
        </div>
      </Link>

      <div className="nav-label">{t("Menu")}</div>
      <div className="nav-items">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.href] ?? Circle;
          return (
            <Link
              key={item.href}
              className="nav-item"
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              prefetch={false}
            >
              <span className="nav-ico" aria-hidden="true">
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="nav-text">{t(item.label)}</span>
              {item.badge === "tickets" && openTickets > 0 && (
                <span className="count">{openTickets}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="foot">
        <span className="foot-ico" aria-hidden="true">
          {live ? (
            <ShieldCheck size={16} strokeWidth={2} />
          ) : (
            <FlaskConical size={16} strokeWidth={2} />
          )}
        </span>
        <div>
          <b>{t(live ? "Live payments" : "Demo mode")}</b>
          <span>
            {t(
              live
                ? "Payments are live on M-Pesa for this company."
                : "Seed data. M-Pesa calls are simulated; no money moves.",
            )}
          </span>
        </div>
      </div>
    </nav>
  );
}
