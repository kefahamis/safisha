"use client";

import { Info, Nfc } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { useT } from "@/lib/i18n";
import { estateName } from "@/lib/reference/estates";
import type { Client } from "@/lib/types";

/** Explains the anatomy of the client number: company · estate · sequence · check digit. */
export function ClientIdCard({ client }: { client: Client }) {
  const [company, estate, tail] = client.id.split("-");
  const { t } = useT();

  return (
    <div className="idcard">
      <div className="idcard-top">
        <div className="label">{t("Client number")}</div>
        <span className="idcard-chip" aria-hidden="true">
          <Nfc size={18} strokeWidth={2.2} aria-hidden="true" />
        </span>
      </div>
      <div className="idnum">{client.id}</div>
      <div className="idparts">
        <span>
          {company} = {t("company")}
        </span>
        <span>
          {estate} = {estateName(client.estate)}
        </span>
        <span>
          {tail.slice(0, 4)} = {t("sequence")}
        </span>
        <span>
          {tail.slice(4)} = {t("check digit")}
        </span>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <CopyButton value={client.id} label={t("Copy number")} />
        <span className="idcard-note">
          <Info size={14} strokeWidth={2.2} aria-hidden="true" />
          {t("Use it as the account number on Paybill")}
        </span>
      </div>
    </div>
  );
}
