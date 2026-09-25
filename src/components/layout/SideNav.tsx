"use client";

import { ChevronLeft, Circle, FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { NAV_ICONS } from "@/components/ui/icons";
import { useT } from "@/lib/i18n";
import { navFor } from "@/lib/navigation";
import { openTicketCount } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";
import { companyById } from "@/lib/reference/companies";
import { brandTokens, companyTagline, DEFAULT_RAIL, resolveColours } from "@/lib/branding";
import { BrandMini, CompanyLogo } from "./CompanyBrand";
import { PlatformIdentity, usePlatformBrand } from "./PlatformBrand";

/**
 * The dark rail: brand, the sections this session may open, and a footnote.
 * Collapsed, it keeps only the icons; labels move into tooltips.
 */
export function SideNav({
  role,
  pathname,
  collapsed,
  onToggle,
}: {
  role: Role;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const s = useAppState();
  const { session } = useSession();
  const { t } = useT();
  // Demo only while every company in view still pays through the simulator.
  const live = Object.values(s.integrations.mpesa).some((m) => m.mode === "live");

  const items = navFor(role, session?.permissions ?? []);
  const platform = usePlatformBrand();
  // Company surfaces wear the company's logo; otherwise the platform's identity shows.
  const branding = role === "admin" ? undefined : s.branding[s.companyId];
  const own = Boolean(branding?.logo);
  const brandName = own ? companyById(s.companyId).name : platform.identity.full;
  // The sidebar colour the logo will sit on, whichever layer set it.
  const railHex =
    brandTokens(resolveColours(role === "admin" ? undefined : branding, platform.branding))?.light["--rail"] ?? DEFAULT_RAIL;
  const toggleLabel = t(collapsed ? "Expand sidebar" : "Collapse sidebar");

  const openTickets =
    role === "company"
      ? openTicketCount(s, (t) => t.company === s.companyId)
      : role === "client"
        ? openTicketCount(s, (t) => t.client === s.clientId)
        : 0;

  return (
    <nav className="side" id="sidebar" aria-label="Sections">
      <button
        type="button"
        className="side-toggle"
        onClick={onToggle}
        aria-controls="sidebar"
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        title={`${toggleLabel}  ( [ )`}
      >
        <ChevronLeft size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>

      <Link href="/" className="brand" prefetch={false} aria-label={collapsed ? brandName : undefined}>
        <span className="brand-full">
          {own && branding ? (
            <CompanyLogo
              branding={branding}
              name={brandName}
              fallbackTagline={companyTagline(platform.branding)}
              railHex={railHex}
            />
          ) : (
            <PlatformIdentity railHex={railHex} />
          )}
        </span>
        <span className="brand-mini">
          <BrandMini branding={own ? branding : platform.branding} name={brandName} railHex={railHex} />
        </span>
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
              data-label={t(item.label)}
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

      <div className="foot" title={collapsed ? t(live ? "Live payments" : "Demo mode") : undefined}>
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
