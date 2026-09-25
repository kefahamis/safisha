/**
 * The permission catalogue.
 *
 * Permissions are `resource.action` strings. They are the only thing the app
 * ever checks — roles exist purely to bundle them, so a permission can be moved
 * between roles (or granted to one person) without touching call sites.
 *
 * Shared by client and server: the admin matrix renders from it, middleware and
 * route handlers check against it.
 */

export const PERMISSION_GROUPS = [
  "My account",
  "Clients",
  "Billing",
  "Accounting",
  "Fleet",
  "Collection",
  "Customer care",
  "Platform",
  "Settings",
  "Access control",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export interface PermissionDef {
  id: string;
  group: PermissionGroup;
  label: string;
  /** Shown as helper text in the admin matrix. */
  detail: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // My account — the client-facing surface
  { id: "account.view", group: "My account", label: "View own account", detail: "See balance, collection schedule and assigned truck." },
  { id: "account.pay", group: "My account", label: "Pay by M-Pesa", detail: "Start an STK Push against their own account." },
  { id: "account.statement", group: "My account", label: "View own statement", detail: "Read the running account for their own client number." },
  { id: "pickups.request", group: "My account", label: "Book on-demand pickups", detail: "Request and pay for bulky or extra collections." },
  { id: "dumping.report", group: "My account", label: "Report illegal dumping", detail: "Photograph and pin a dump site for the collector or county." },

  // Clients
  { id: "clients.view", group: "Clients", label: "View client register", detail: "List and search clients within scope." },
  { id: "clients.create", group: "Clients", label: "Register clients", detail: "Issue a new client number and raise the first charge." },
  { id: "clients.edit", group: "Clients", label: "Edit clients", detail: "Change plan, estate or contact details." },

  // Billing
  { id: "statements.view", group: "Billing", label: "View any statement", detail: "Open the running account for any client in scope." },
  { id: "payments.view", group: "Billing", label: "View payments", detail: "See received M-Pesa payments and their receipts." },
  { id: "payments.simulate", group: "Billing", label: "Simulate C2B payment", detail: "Fire a test Paybill confirmation into the system." },
  { id: "payments.reconcile", group: "Billing", label: "Reconcile suspense", detail: "Assign unmatched payments to a client by hand." },
  { id: "reminders.manage", group: "Billing", label: "Run billing reminders", detail: "Preview and send arrears reminders and payment prompts." },

  // Accounting
  { id: "finance.view", group: "Accounting", label: "View financial reports", detail: "Trial balance, profit & loss, balance sheet, journal and ledgers." },
  { id: "finance.journal", group: "Accounting", label: "Post journal entries", detail: "Record expenses, capital and adjustments, and reverse manual entries." },

  // Fleet
  { id: "fleet.view", group: "Fleet", label: "View fleet map", detail: "See truck positions and status across the company." },
  { id: "fleet.track", group: "Fleet", label: "Track own collector", detail: "See the trucks serving their own estate." },

  // Collection
  { id: "route.view", group: "Collection", label: "View route sheet", detail: "Open today's stop list for the assigned truck." },
  { id: "route.complete", group: "Collection", label: "Complete stops", detail: "Mark stops collected or flag no access." },
  { id: "route.share_location", group: "Collection", label: "Toggle GPS sharing", detail: "Turn the truck's location broadcast on or off." },
  { id: "pickups.manage", group: "Collection", label: "Manage pickup requests", detail: "Schedule, assign and complete on-demand pickups." },
  { id: "dumping.manage", group: "Collection", label: "Manage dumping reports", detail: "Assign and clear illegal dumping reports." },

  // Customer care
  { id: "tickets.view.own", group: "Customer care", label: "View own tickets", detail: "Read and open their own care conversations." },
  { id: "tickets.view.company", group: "Customer care", label: "View company inbox", detail: "Read every ticket raised against the company." },
  { id: "tickets.reply", group: "Customer care", label: "Reply to tickets", detail: "Post a message into a care conversation." },
  { id: "tickets.status", group: "Customer care", label: "Change ticket status", detail: "Move tickets between open, pending and resolved." },
  { id: "tickets.translate", group: "Customer care", label: "Translate conversations", detail: "Translate Sheng, Kiswahili and English messages in the chat." },

  // Platform
  { id: "platform.overview", group: "Platform", label: "View city overview", detail: "Cross-company KPIs and collection rates." },
  { id: "platform.clients", group: "Platform", label: "View all clients", detail: "The client database across every company." },
  { id: "platform.fleet", group: "Platform", label: "View all fleets", detail: "Every company's trucks on one map." },

  // Settings
  { id: "settings.company.manage", group: "Settings", label: "Company settings", detail: "M-Pesa keys, billing reminders and pickup pricing for their company." },
  { id: "settings.platform.manage", group: "Settings", label: "Platform settings", detail: "SMS, USSD, email and AI integrations, and any company's M-Pesa." },
  { id: "audit.view", group: "Settings", label: "View audit log", detail: "See who changed settings, roles, users and payments." },

  // Access control
  { id: "access.roles.manage", group: "Access control", label: "Manage roles", detail: "Create roles and change which permissions they carry." },
  { id: "access.users.manage", group: "Access control", label: "Manage users", detail: "Assign roles, grant overrides, suspend accounts." },
];

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);

const BY_ID = new Map(PERMISSIONS.map((p) => [p.id, p]));

export const permissionById = (id: string) => BY_ID.get(id);

export const isPermissionId = (id: string): boolean => BY_ID.has(id);

export const permissionsByGroup = (): { group: PermissionGroup; items: PermissionDef[] }[] =>
  PERMISSION_GROUPS.map((group) => ({
    group,
    items: PERMISSIONS.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);
