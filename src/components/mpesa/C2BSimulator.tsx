"use client";

import { Braces, ChevronDown, CircleAlert, CircleCheck, FlaskConical, Zap } from "lucide-react";
import { useState } from "react";
import type { Company } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

interface C2BResult {
  ok: boolean;
  message: string;
  receipt: string;
  date: string;
}

/** Stands in for Safaricom's C2B confirmation callback hitting the platform. */
export function C2BSimulator({
  company,
  defaultAccount,
}: {
  company: Company;
  defaultAccount: string;
}) {
  const actions = useActions();
  const s = useAppState();
  const live = s.integrations.mpesa[company.id]?.mode === "live";
  const [account, setAccount] = useState(defaultAccount);
  const [amount, setAmount] = useState("600");
  const [phone, setPhone] = useState("0712 345 678");
  const [result, setResult] = useState<C2BResult | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await actions.payC2B(company.id, { account, amount: Number(amount), phone });
    setBusy(false);
    if (!res.ok) {
      setResult({ ok: false, message: res.error, receipt: "", date: "" });
      return;
    }
    const data = (res.data ?? {}) as { matched?: boolean; date?: string };
    setResult({ ok: Boolean(data.matched), message: res.message ?? "", receipt: res.id ?? "", date: data.date ?? "" });
  };

  const payload = result
    ? JSON.stringify(
        {
          TransactionType: "Pay Bill",
          TransID: result.receipt,
          TransTime: (result.date || "").replace(/[-: ]/g, "") + "00",
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
      <h3 className="with-ico">
        <FlaskConical size={17} strokeWidth={2.2} aria-hidden="true" />
        Simulate a Paybill payment
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        {live
          ? "Asks the Daraja sandbox to send a test payment to your Paybill. It posts here when Safaricom calls back."
          : "Stands in for Safaricom’s C2B confirmation callback. Try a typo in the account number."}
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
        <button className="btn primary" disabled={busy}>
          <Zap size={16} strokeWidth={2.2} aria-hidden="true" />
          {busy ? "Sending…" : live ? "Send sandbox payment" : "Send C2B payment"}
        </button>
      </form>

      {result && (
        <div>
          <p className={`result ${result.ok ? "ok" : "bad"}`}>
            {result.ok ? (
              <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <CircleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
            {result.message}
          </p>
          {result.receipt && (
          <details>
            <summary>
              <Braces size={15} strokeWidth={2.2} aria-hidden="true" />
              C2B confirmation payload
              <ChevronDown size={15} strokeWidth={2.2} className="chev" aria-hidden="true" />
            </summary>
            <pre className="code">{payload}</pre>
          </details>
          )}
        </div>
      )}
    </div>
  );
}
