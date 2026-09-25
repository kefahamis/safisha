import { kes } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import type { TicketStatus } from "@/lib/types";
import type { ReactNode } from "react";

export type ChipTone = "ok" | "warn" | "bad" | "neutral";

export function Chip({
  tone = "neutral",
  numeric,
  children,
}: {
  tone?: ChipTone;
  numeric?: boolean;
  children: ReactNode;
}) {
  return <span className={`chip ${tone}${numeric ? " num" : ""}`}>{children}</span>;
}

/** Owes / credit / paid up, coloured by sign. */
export function BalanceChip({ balance }: { balance: number }) {
  if (balance > 0)
    return (
      <Chip tone="bad" numeric>
        Owes {kes(balance)}
      </Chip>
    );
  if (balance < 0)
    return (
      <Chip tone="ok" numeric>
        Credit {kes(-balance)}
      </Chip>
    );
  return <Chip tone="neutral">Paid up</Chip>;
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const tone: ChipTone = status === "Open" ? "warn" : status === "Pending" ? "neutral" : "ok";
  return <Chip tone={tone}>{status}</Chip>;
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
