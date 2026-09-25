"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { roleFromPath } from "@/lib/navigation";
import { StkModal } from "@/components/mpesa/StkModal";
import { useFleetTicker } from "@/store/StoreProvider";
import { ContextSwitcher } from "./ContextSwitcher";
import { RoleTabs } from "./RoleTabs";
import { SideNav } from "./SideNav";
import { UserMenu } from "./UserMenu";

/** Dark rail, top bar and page slot. The active role comes from the URL. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const role = roleFromPath(pathname);
  useFleetTicker();

  return (
    <>
      <div className="app">
        <SideNav role={role} pathname={pathname} />
        <header className="top">
          <RoleTabs active={role} />
          <ContextSwitcher role={role} />
          <UserMenu />
        </header>
        <main>{children}</main>
      </div>
      <StkModal />
    </>
  );
}
