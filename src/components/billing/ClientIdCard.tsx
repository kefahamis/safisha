"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { estateName } from "@/lib/reference/estates";
import type { Client } from "@/lib/types";

/** Explains the anatomy of the client number: company · estate · sequence · check digit. */
export function ClientIdCard({ client }: { client: Client }) {
  const [company, estate, tail] = client.id.split("-");

  return (
    <div className="idcard">
      <div className="label">Client number</div>
      <div className="idnum">{client.id}</div>
      <div className="idparts">
        <span>{company} = company</span>
        <span>
          {estate} = {estateName(client.estate)}
        </span>
        <span>{tail.slice(0, 4)} = sequence</span>
        <span>{tail.slice(4)} = check digit</span>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <CopyButton value={client.id} label="Copy number" />
        <span style={{ fontSize: ".82rem", opacity: 0.75 }}>
          Use it as the account number on Paybill
        </span>
      </div>
    </div>
  );
}
