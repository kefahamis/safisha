"use client";

import { ChevronDown, ChevronLeft, Circle, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { NAV_ICONS } from "@/components/ui/icons";
import { useT } from "@/lib/i18n";
import { navTreeFor, type NavItem } from "@/lib/navigation";
import { openTicketCount } from "@/lib/selectors";
import type { Role } from "@/lib/types";
import { useAppState } from "@/store/StoreProvider";
import { companyById } from "@/lib/reference/companies";
import { brandTokens, companyTagline, DEFAULT_RAIL, resolveColours } from "@/lib/branding";
import { BrandMini, CompanyLogo } from "./CompanyBrand";
import { PlatformIdentity, usePlatformBrand } from "./PlatformBrand";

/** Sections that live at the foot of the rail rather than in the main list. */
const BOTTOM = /\/(settings|audit)$/;

/**
 * The dark rail: brand, the sections this session may open, and the tools at its foot.
 * Collapsed, it keeps only the icons; labels move into tooltips. On phones it
 * becomes a slim header whose menu button slides the sections in from the left
 * as a drawer, pushing the page aside.
 */
export function SideNav({
  role,
  pathname,
  collapsed,
  onToggle,
  menuOpen,
  onMenu,
}: {
  role: Role;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  const s = useAppState();
  const { session } = useSession();
  const { t } = useT();

  const tree = navTreeFor(role, session?.permissions ?? []);
  // The icon rail has no room for nesting: there, a group's sections sit in line.
  const all = collapsed ? tree.flatMap((i) => i.children ?? [i]) : tree;
  // Settings and the audit log are housekeeping: they close the rail, under a Tools label.
  const items = all.filter((i) => !BOTTOM.test(i.href));
  const bottom = all.filter((i) => BOTTOM.test(i.href));

  // A group opens by itself when one of its sections is the current page.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const active = tree.find((g) => g.children?.some((c) => c.href === pathname));
    if (active) setOpen((o) => (o[active.href] ? o : { ...o, [active.href]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
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

      <Link href="/start" className="brand" prefetch={false} aria-label={collapsed ? brandName : undefined}>
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

      <button
        type="button"
        className="nav-menu-btn"
        onClick={() => onMenu(!menuOpen)}
        aria-controls="nav-menu"
        aria-expanded={menuOpen}
        aria-label={t(menuOpen ? "Close menu" : "Open menu")}
      >
        {menuOpen ? <X size={20} strokeWidth={2.2} aria-hidden="true" /> : <Menu size={20} strokeWidth={2.2} aria-hidden="true" />}
      </button>

      {/* The phone drawer. On wider screens it adds no box of its own. */}
      <div className="nav-panel" id="nav-menu">
        <div className="nav-label">{t("Menu")}</div>
        {/* Choosing a section closes the phone menu, even when it is the current page. */}
        <div className="nav-items" onClick={(e) => (e.target as HTMLElement).closest("a") && onMenu(false)}>
          {items.map((item) => {
            if (!item.children) return navLink(item);
            const Icon = NAV_ICONS[item.href] ?? Circle;
            const expanded = Boolean(open[item.href]);
            const here = item.children.some((c) => c.href === pathname);
            const id = `nav-group-${item.href.replace(/\W+/g, "-")}`;
            return (
              <div key={item.href} className={`nav-group${expanded ? " open" : ""}${here ? " here" : ""}`}>
                <button
                  type="button"
                  className="nav-item"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() => setOpen((o) => ({ ...o, [item.href]: !expanded }))}
                >
                  <span className="nav-ico" aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="nav-text">{t(item.label)}</span>
                  {!expanded && item.children.some((c) => c.badge === "tickets") && openTickets > 0 && (
                    <span className="count">{openTickets}</span>
                  )}
                  <ChevronDown size={16} strokeWidth={2.2} className="nav-chev" aria-hidden="true" />
                </button>
                <div className="nav-sub" id={id} hidden={!expanded}>
                  {item.children.map((child) => navLink(child, true))}
                </div>
              </div>
            );
          })}
        </div>

        {bottom.length > 0 && (
          <div className="nav-tools">
            <div className="nav-label" id="nav-tools-label">
              {t("Tools")}
            </div>
            <div
              className="nav-items"
              role="group"
              aria-labelledby="nav-tools-label"
              onClick={(e) => (e.target as HTMLElement).closest("a") && onMenu(false)}
            >
              {bottom.map((item) => navLink(item))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );

  // A plain function rather than a component: the rail re-renders every second
  // with the live trucks, and a component defined in here would remount each time.
  function navLink(item: NavItem, sub = false) {
    const Icon = NAV_ICONS[item.href] ?? Circle;
    return (
      <Link
        key={item.href}
        className={`nav-item${sub ? " sub" : ""}`}
        href={item.href}
        data-label={t(item.label)}
        aria-current={pathname === item.href ? "page" : undefined}
        prefetch={false}
      >
        <span className="nav-ico" aria-hidden="true">
          <Icon size={sub ? 16 : 18} strokeWidth={2} />
        </span>
        <span className="nav-text">{t(item.label)}</span>
        {item.badge === "tickets" && openTickets > 0 && <span className="count">{openTickets}</span>}
      </Link>
    );
  }
}
