import {
  Building2,
  ClipboardList,
  Hourglass,
  Recycle,
  ScrollText,
  Settings,
  TriangleAlert,
  CircleCheck,
  CircleDot,
  Clock3,
  CreditCard,
  FileText,
  Headset,
  LayoutDashboard,
  LocateFixed,
  Map,
  MapPinned,
  Route,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role, TicketStatus } from "@/lib/types";

/*
 * The app's icon vocabulary in one place, so a concept always wears the same
 * glyph. Kept apart from lib/navigation because Edge middleware imports that
 * module and has no use for React components.
 */

export const NAV_ICONS: Record<string, LucideIcon> = {
  "/client": Wallet,
  "/client/statement": FileText,
  "/client/track": MapPinned,
  "/client/pickups": ClipboardList,
  "/client/report": TriangleAlert,
  "/client/support": Headset,
  "/company": LayoutDashboard,
  "/company/clients": Users,
  "/company/map": Map,
  "/company/payments": CreditCard,
  "/company/arrears": Hourglass,
  "/company/statements": FileText,
  "/company/pickups": ClipboardList,
  "/company/dumping": TriangleAlert,
  "/company/impact": Recycle,
  "/company/support": Headset,
  "/company/settings": Settings,
  "/company/audit": ScrollText,
  "/collector": Route,
  "/collector/map": LocateFixed,
  "/admin": LayoutDashboard,
  "/admin/clients": UsersRound,
  "/admin/map": Map,
  "/admin/dumping": TriangleAlert,
  "/admin/access": ShieldCheck,
  "/admin/users": Users,
  "/admin/settings": Settings,
  "/admin/audit": ScrollText,
};

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  client: UserRound,
  company: Building2,
  collector: Truck,
  admin: ShieldCheck,
};

export const TICKET_ICONS: Record<TicketStatus, LucideIcon> = {
  Open: CircleDot,
  Pending: Clock3,
  Resolved: CircleCheck,
};
