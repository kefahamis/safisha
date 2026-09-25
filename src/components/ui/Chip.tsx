"use client";

import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  Navigation,
  PiggyBank,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { kes } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { companyById } from "@/lib/reference/companies";
import type { TicketStatus } from "@/lib/types";
import type { ReactNode } from "react";
import { TICKET_ICONS } from "./icons";

export type ChipTone = "ok" | "warn" | "bad" | "neutral";

export function Chip({
  tone = "neutral",
  numeric,
  icon: Icon,
  children,
}: {
  tone?: ChipTone;
  numeric?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className={`chip ${tone}${numeric ? " num" : ""}`}>
      {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Owes / credit / paid up, coloured by sign. */
export function BalanceChip({ balance }: { balance: number }) {
  const { t } = useT();
  if (balance > 0)
    return (
      <Chip tone="bad" numeric icon={CircleAlert}>
        {t("Owes {amount}", { amount: kes(balance) })}
      </Chip>
    );
  if (balance < 0)
    return (
      <Chip tone="ok" numeric icon={PiggyBank}>
        {t("Credit {amount}", { amount: kes(-balance) })}
      </Chip>
    );
  return (
    <Chip tone="ok" icon={CircleCheck}>
      {t("Paid up")}
    </Chip>
  );
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const { t } = useT();
  const tone: ChipTone = status === "Open" ? "warn" : status === "Pending" ? "neutral" : "ok";
  return (
    <Chip tone={tone} icon={TICKET_ICONS[status]}>
      {t(status)}
    </Chip>
  );
}

const TRUCK_ICONS: Record<ChipTone, LucideIcon> = {
  ok: Navigation,
  warn: CirclePause,
  neutral: WifiOff,
  bad: WifiOff,
};

/** A truck's on-route / paused / offline state from `truckState`. */
export function TruckChip({ state }: { state: { label: string; cls: ChipTone } }) {
  const { t } = useT();
  return (
    <Chip tone={state.cls} icon={TRUCK_ICONS[state.cls]}>
      {t(state.label)}
    </Chip>
  );
}

/** Company name with its fleet colour swatch. */
export function CompanyTag({ companyId }: { companyId: string }) {
  const co = companyById(companyId);
  return (
    <span className="co">
      <span className="dot" style={{ background: co.color }} />
      {co.name}
    </span>
  );
}
