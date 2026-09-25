import { kes } from "@/lib/format";
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
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>
        Or pay via Lipa na M-Pesa
      </div>
      <dl className="paybill">
        <dt>Business no.</dt>
        <dd>{company.paybill}</dd>
        <dt>Account no.</dt>
        <dd>{client.id}</dd>
        <dt>Amount</dt>
        <dd>{kes(amount)}</dd>
      </dl>
      <p className="hint">Payments post to your account automatically within a minute.</p>
    </div>
  );
}
