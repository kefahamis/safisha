import type { RoleDef, Workspace } from "./types";

/**
 * The roles the platform ships with. An admin can edit their permission sets
 * and add roles of their own, but these five cannot be deleted — every seeded
 * account holds one of them.
 */
export const DEFAULT_ROLES: RoleDef[] = [
  {
    id: "client",
    name: "Client",
    description: "A household or business receiving collection.",
    workspace: "client",
    system: true,
    permissions: [
      "account.view",
      "account.pay",
      "account.statement",
      "pickups.request",
      "dumping.report",
      "fleet.track",
      "tickets.view.own",
      "tickets.reply",
      "tickets.translate",
    ],
  },
  {
    id: "collector",
    name: "Collector",
    description: "A driver working today's route.",
    workspace: "collector",
    system: true,
    permissions: ["route.view", "route.complete", "route.share_location", "fleet.view"],
  },
  {
    id: "company_agent",
    name: "Care agent",
    description: "Answers the care desk and reads billing, but cannot change it.",
    workspace: "company",
    system: true,
    permissions: [
      "clients.view",
      "statements.view",
      "payments.view",
      "fleet.view",
      "tickets.view.company",
      "tickets.reply",
      "tickets.status",
      "tickets.translate",
      "pickups.manage",
      "dumping.manage",
    ],
  },
  {
    id: "company_admin",
    name: "Company admin",
    description: "Runs one collection company end to end.",
    workspace: "company",
    system: true,
    permissions: [
      "clients.view",
      "clients.create",
      "clients.edit",
      "statements.view",
      "payments.view",
      "payments.simulate",
      "payments.reconcile",
      "reminders.manage",
      "fleet.view",
      "tickets.view.company",
      "tickets.reply",
      "tickets.status",
      "tickets.translate",
      "pickups.manage",
      "dumping.manage",
      "settings.company.manage",
      "audit.view",
      "finance.view",
      "finance.journal",
    ],
  },
  {
    id: "platform_admin",
    name: "Platform admin",
    description: "Oversees every licensed company and manages access.",
    workspace: "admin",
    system: true,
    permissions: [
      "platform.overview",
      "platform.clients",
      "platform.fleet",
      "access.roles.manage",
      "access.users.manage",
      "clients.view",
      "statements.view",
      "dumping.manage",
      "settings.platform.manage",
      "settings.company.manage",
      "audit.view",
      "finance.view",
    ],
  },
];

/**
 * Which dashboards a role may open, beyond its home workspace. Platform admins
 * drill into a company's views from the overview table; everyone else is
 * confined to their own surface.
 *
 * This travels in the token because Edge middleware gates routes before any
 * server store is reachable.
 */
export function allowedWorkspaces(role: RoleDef): Workspace[] {
  if (role.workspace === "admin") return ["admin", "company"];
  return [role.workspace];
}
