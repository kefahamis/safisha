"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { roleFromPath, SIDEBAR_COOKIE } from "@/lib/navigation";
import { StkModal } from "@/components/mpesa/StkModal";
import { useAppState, useFleetTicker, useLiveSync } from "@/store/StoreProvider";
import { BrandTheme } from "./CompanyBrand";
import { ContextSwitcher } from "./ContextSwitcher";
import { OfflineSupport } from "./OfflineSupport";
import { RoleTabs } from "./RoleTabs";
import { SideNav } from "./SideNav";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

/** Typing in a field should never fold the sidebar away. */
const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Dark rail, top bar and page slot. The active role comes from the URL. */
export function AppShell({ children, sidebarCollapsed = false }: { children: ReactNode; sidebarCollapsed?: boolean }) {
  const pathname = usePathname();
  const role = roleFromPath(pathname);
  const s = useAppState();
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  // The phone menu; it only exists below the rail breakpoint.
  const [menuOpen, setMenuOpen] = useState(false);
  useFleetTicker();
  useLiveSync();

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // "[" folds and unfolds the sidebar, as in Linear and Notion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // A new page closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      {/* The platform layer comes from the root layout; this adds the company's on top. */}
      <BrandTheme branding={role === "admin" ? undefined : s.branding[s.companyId]} />
      <div className="app" data-sidebar={collapsed ? "collapsed" : "expanded"} data-menu={menuOpen ? "open" : undefined}>
        <SideNav
          role={role}
          pathname={pathname}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          menuOpen={menuOpen}
          onMenu={setMenuOpen}
        />
        {/* Always present so it can fade out as the drawer closes. */}
        <div className="nav-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
        <header className="top">
          <RoleTabs active={role} />
          <ContextSwitcher role={role} />
          <div className="top-actions">
            <NotificationBell role={role} />
            <UserMenu />
          </div>
        </header>
        <main>{children}</main>
      </div>
      <StkModal />
      <OfflineSupport />
    </>
  );
}
