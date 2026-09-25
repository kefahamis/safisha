"use client";

import { useState } from "react";
import type { Company } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";
import type { C2BResult } from "@/store/actions";

/** Stands in for Safaricom's C2B confirmation callback hitting the platform. */
export function C2BSimulator({
  company,
  defaultAccount,
}: {
  company: Company;
  defaultAccount: string;
}) {
  const actions = useActions();
  const [account, setAccount] = useState(defaultAccount);
  const [amount, setAmount] = useState("600");
  const [phone, setPhone] = useState("0712 345 678");
  const [result, setResult] = useState<C2BResult | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(actions.payC2B(company.id, { account, amount: Number(amount), phone }));
  };

  const payload = result
    ? JSON.stringify(
        {
          TransactionType: "Pay Bill",
          TransID: result.receipt,
          TransTime: result.date.replace(/[-: ]/g, "") + "00",
          TransAmount: String(amount),
          BusinessShortCode: company.paybill,
          BillRefNumber: account,
          MSISDN: "2547*****" + phone.replace(/\D/g, "").slice(-3),
          FirstName: "DEMO",
        },
        null,
        2,
      )
    : "";

  return (
    <div className="panel">
      <h3>Simulate a Paybill payment</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Stands in for Safaricom’s C2B confirmation callback. Try a typo in the account number.
      </p>
      <form className="stack" onSubmit={submit}>
        <label className="f">
          Account no. (BillRefNumber)
          <input
            required
            className="mono"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </label>
        <div className="grid g2" style={{ gap: 10 }}>
          <label className="f">
            Amount (KES)
            <input
              type="number"
              min={10}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="f">
            Payer phone
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <button className="btn primary">Send C2B payment</button>
      </form>

      {result && (
        <div>
          <p
            className={result.ok ? undefined : "err"}
            style={result.ok ? { color: "var(--ok)", fontWeight: 600 } : undefined}
          >
            {result.message}
          </p>
          <details>
            <summary>C2B confirmation payload</summary>
            <pre className="code">{payload}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
