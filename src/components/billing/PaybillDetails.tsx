"use client";

import { Landmark, Zap } from "lucide-react";
import { kes } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Client, Company } from "@/lib/types";

/** The manual alternative to STK Push: Lipa na M-Pesa business + account number. */
export function PaybillDetails({
  client,
  company,
  amount,
}: {
  client: Client;
  company: Company;
  amount: number;
}) {
  const { t } = useT();
  return (
    <div>
      <div className="label with-ico" style={{ marginBottom: 6 }}>
        <Landmark size={14} strokeWidth={2.2} aria-hidden="true" />
        {t("Or pay via Lipa na M-Pesa")}
      </div>
      <dl className="paybill">
        <dt>{t("Business no.")}</dt>
        <dd>{company.paybill}</dd>
        <dt>{t("Account no.")}</dt>
        <dd>{client.id}</dd>
        <dt>{t("Amount")}</dt>
        <dd>{kes(amount)}</dd>
      </dl>
      <p className="hint with-ico">
        <Zap size={13} strokeWidth={2.2} aria-hidden="true" />
        {t("Payments post to your account automatically within a minute.")}
      </p>
    </div>
  );
}
