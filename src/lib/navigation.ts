import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the session holds one of these. */
  requires: string[];
  /** Sections whose badge shows the open ticket count. */
  badge?: "tickets";
}

export const ROLES: { role: Role; label: string }[] = [
  { role: "client", label: "Client" },
  { role: "company", label: "Company" },
  { role: "collector", label: "Collector" },
  { role: "admin", label: "Admin" },
];

export const NAV: Record<Role, NavItem[]> = {
  client: [
    { href: "/client", label: "My account", requires: ["account.view"] },
    { href: "/client/statement", label: "Statement", requires: ["account.statement"] },
    { href: "/client/track", label: "Track collector", requires: ["fleet.track"] },
    {
      href: "/client/support",
      label: "Customer care",
      requires: ["tickets.view.own"],
      badge: "tickets",
    },
  ],
  company: [
    { href: "/company", label: "Dashboard", requires: ["clients.view"] },
    { href: "/company/clients", label: "Clients", requires: ["clients.view"] },
    { href: "/company/map", label: "Fleet map", requires: ["fleet.view"] },
    { href: "/company/payments", label: "M-Pesa payments", requires: ["payments.view"] },
    { href: "/company/statements", label: "Statements", requires: ["statements.view"] },
    {
      href: "/company/support",
      label: "Customer care",
      requires: ["tickets.view.company"],
      badge: "tickets",
    },
  ],
  collector: [
    { href: "/collector", label: "Today’s route", requires: ["route.view"] },
    { href: "/collector/map", label: "My location", requires: ["fleet.view"] },
  ],
  admin: [
    { href: "/admin", label: "Overview", requires: ["platform.overview"] },
    { href: "/admin/clients", label: "Client database", requires: ["platform.clients"] },
    { href: "/admin/map", label: "City map", requires: ["platform.fleet"] },
    { href: "/admin/access", label: "Roles & permissions", requires: ["access.roles.manage"] },
    { href: "/admin/users", label: "Users", requires: ["access.users.manage"] },
  ],
};

export const roleHome = (role: Role) => NAV[role][0].href;

const ROLE_SET = new Set<string>(ROLES.map((r) => r.role));

/** Derives the active workspace from the URL; the route is the source of truth. */
export function roleFromPath(pathname: string): Role {
  const first = pathname.split("/").filter(Boolean)[0];
  return first && ROLE_SET.has(first) ? (first as Role) : "client";
}

/** The sections this session may actually open. */
export function navFor(role: Role, permissions: string[]): NavItem[] {
  const held = new Set(permissions);
  return NAV[role].filter((item) => item.requires.some((p) => held.has(p)));
}

/**
 * Where to send someone after signing in: their workspace's first section that
 * they can actually open, rather than one they'd be bounced out of.
 */
export function landingFor(role: Role, permissions: string[]): string {
  return navFor(role, permissions)[0]?.href ?? roleHome(role);
}
