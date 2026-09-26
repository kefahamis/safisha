import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  /** Hidden unless the session holds one of these; empty means everyone in the workspace. */
  requires: string[];
  /** Sections whose badge shows the open ticket count. */
  badge?: "tickets";
  /**
   * A group: a parent row that folds its sections away. The parent's own href
   * only keys it (and its icon); each child checks its own permissions.
   */
  children?: NavItem[];
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
    { href: "/client/pickups", label: "Book a pickup", requires: ["pickups.request"] },
    { href: "/client/report", label: "Report dumping", requires: ["dumping.report"] },
    {
      href: "/client/support",
      label: "Customer care",
      requires: ["tickets.view.own"],
      badge: "tickets",
    },
  ],
  company: [
    { href: "/company", label: "Dashboard", requires: ["clients.view"] },
    { href: "/company/desk", label: "My dashboard", requires: [] },
    { href: "/company/clients", label: "Clients", requires: ["clients.view"] },
    {
      href: "group:fleet",
      label: "Fleet management",
      requires: [],
      children: [
        { href: "/company/fleet", label: "Overview", requires: ["fleet.manage"] },
        { href: "/company/map", label: "Fleet map", requires: ["fleet.view"] },
      ],
    },
    { href: "/company/arrears", label: "Arrears & reminders", requires: ["payments.view"] },
    {
      href: "group:finance",
      label: "Financial reports",
      requires: [],
      children: [
        { href: "/company/finance", label: "Reports", requires: ["finance.view"] },
        { href: "/company/invoices", label: "Invoices", requires: ["statements.view"] },
        { href: "/company/payments", label: "M-Pesa payments", requires: ["payments.view"] },
        { href: "/company/statements", label: "Statements", requires: ["statements.view"] },
      ],
    },
    { href: "/company/pickups", label: "Pickup requests", requires: ["pickups.manage"] },
    { href: "/company/dumping", label: "Dumping reports", requires: ["dumping.manage"] },
    { href: "/company/impact", label: "Recycling", requires: ["clients.view"] },
    {
      href: "group:care",
      label: "Customer care",
      requires: [],
      children: [
        { href: "/company/support", label: "Chat agent", requires: ["tickets.view.company"], badge: "tickets" },
        { href: "/company/tickets", label: "Tickets", requires: ["tickets.view.company"] },
      ],
    },
    {
      href: "group:team",
      label: "Staff & departments",
      requires: [],
      children: [
        { href: "/company/staff", label: "Staff", requires: ["staff.manage"] },
        { href: "/company/departments", label: "Departments", requires: ["staff.manage"] },
      ],
    },
    { href: "/company/settings", label: "Settings", requires: ["settings.company.manage"] },
    { href: "/company/audit", label: "Audit log", requires: ["audit.view"] },
  ],
  collector: [
    { href: "/collector", label: "Today’s route", requires: ["route.view"] },
    { href: "/collector/vehicle", label: "My truck", requires: ["fleet.inspect"] },
    { href: "/collector/map", label: "My location", requires: ["fleet.view"] },
  ],
  admin: [
    { href: "/admin", label: "Overview", requires: ["platform.overview"] },
    { href: "/admin/clients", label: "Client database", requires: ["platform.clients"] },
    { href: "/admin/map", label: "City map", requires: ["platform.fleet"] },
    { href: "/admin/companies", label: "Companies & estates", requires: ["platform.companies.manage"] },
    { href: "/admin/dumping", label: "Dumping reports", requires: ["dumping.manage"] },
    { href: "/admin/access", label: "Roles & permissions", requires: ["access.roles.manage"] },
    { href: "/admin/users", label: "Users", requires: ["access.users.manage"] },
    { href: "/admin/settings", label: "Settings", requires: ["settings.platform.manage"] },
    { href: "/admin/audit", label: "Audit log", requires: ["audit.view"] },
  ],
};

/** Remembers whether the sidebar is folded to icons; read on the server to avoid a jump. */
export const SIDEBAR_COOKIE = "zoa-sidebar";

export const roleHome = (role: Role) => NAV[role][0].href;

/** Groups flattened to their sections, for anything that needs a plain list. */
const leaves = (items: NavItem[]): NavItem[] => items.flatMap((i) => (i.children ? leaves(i.children) : [i]));

const ROLE_SET = new Set<string>(ROLES.map((r) => r.role));

/** Derives the active workspace from the URL; the route is the source of truth. */
export function roleFromPath(pathname: string): Role {
  const first = pathname.split("/").filter(Boolean)[0];
  return first && ROLE_SET.has(first) ? (first as Role) : "client";
}

/**
 * The menu this session may actually open: sections it holds a permission for,
 * and groups that still have at least one of those left.
 */
export function navTreeFor(role: Role, permissions: string[]): NavItem[] {
  const held = new Set(permissions);
  const allowed = (item: NavItem) => item.requires.length === 0 || item.requires.some((p) => held.has(p));
  return NAV[role].flatMap((item) => {
    if (!item.children) return allowed(item) ? [item] : [];
    const children = item.children.filter(allowed);
    return children.length ? [{ ...item, children }] : [];
  });
}

/** The sections this session may open, as a flat list. */
export function navFor(role: Role, permissions: string[]): NavItem[] {
  return leaves(navTreeFor(role, permissions));
}

/**
 * Where to send someone after signing in: their workspace's first section that
 * they can actually open, rather than one they'd be bounced out of.
 */
export function landingFor(role: Role, permissions: string[]): string {
  // Company staff start on their own work queue; whoever runs the company, on its dashboard.
  if (role === "company" && !permissions.includes("staff.manage")) return "/company/desk";
  return navFor(role, permissions)[0]?.href ?? roleHome(role);
}
