"use client";

import { useEffect, useMemo, useState } from "react";
import { BalanceChip } from "@/components/ui/Chip";
import { fmtDate, group } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { balance, clientById } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";

/** Simulated Lipa na M-Pesa Online (STK Push): form → handset prompt → callback. */
export function StkModal() {
  const s = useAppState();
  const actions = useActions();
  const stk = s.stk;

  useEffect(() => {
    if (!stk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.closeStk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stk, actions]);

  if (!stk) return null;

  const client = clientById(s, stk.client);
  if (!client) return null;
  const company = companyById(client.company);

  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.closeStk();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="M-Pesa payment">
        {stk.step === "form" && <StkForm />}

        {stk.step === "phone" && (
          <>
            <h2>Check your phone</h2>
            <p className="hint">
              This is what appears on {stk.phone}. The PIN is entered on the phone, never on this
              site.
            </p>
            <div className="phone">
              <div className="scr">
                <div className="hdr">
                  <span>Safaricom</span>
                  <span>10:15</span>
                </div>
                <div className="box">
                  Do you want to pay <b>Ksh{group(stk.amount)}.00</b> to{" "}
                  <b>{company.name.toUpperCase()}</b> account no. <b>{client.id}</b>?
                  <br />
                  <br />
                  Enter M-PESA PIN:
                </div>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => {
                      actions.setStkStep("wait");
                      window.setTimeout(() => actions.completeStk(), 1600);
                    }}
                  >
                    Approve (simulate)
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => actions.setStkStep("declined")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {stk.step === "wait" && (
          <>
            <h2>Confirming payment…</h2>
            <div className="spinner" aria-hidden="true" />
            <p className="hint" style={{ textAlign: "center" }}>
              Waiting for Safaricom’s callback.
            </p>
          </>
        )}

        {stk.step === "done" && stk.txn && <StkReceipt />}

        {stk.step === "declined" && (
          <>
            <h2>Payment cancelled</h2>
            <p>
              The request was cancelled on the phone (ResultCode 1032). Nothing was charged.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                onClick={() => actions.openStk(stk.client)}
              >
                Try again
              </button>
              <button type="button" className="btn ghost" onClick={() => actions.closeStk()}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StkForm() {
  const s = useAppState();
  const actions = useActions();
  const stk = s.stk!;
  const [phone, setPhone] = useState(stk.phone);
  const [amount, setAmount] = useState(String(stk.amount));
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = actions.submitStk(phone, Number(amount));
    if (!result.ok) setError(result.error);
  };

  return (
    <>
      <h2>Pay with M-Pesa</h2>
      <p className="hint">We’ll send a payment prompt to your phone (STK Push).</p>
      <form className="stack" onSubmit={submit}>
        <label className="f">
          M-Pesa phone number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
          />
        </label>
        <label className="f">
          Amount (KES)
          <input
            type="number"
            min={10}
            max={150000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        {error && <div className="err">{error}</div>}
        <div className="row">
          <button className="btn primary">Send prompt</button>
          <button type="button" className="btn ghost" onClick={() => actions.closeStk()}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}

function StkReceipt() {
  const s = useAppState();
  const actions = useActions();
  const stk = s.stk!;
  const txn = stk.txn!;
  const client = clientById(s, stk.client)!;
  const company = companyById(client.company);

  const callback = useMemo(
    () =>
      JSON.stringify(
        {
          Body: {
            stkCallback: {
              MerchantRequestID: "29115-34620561-1",
              CheckoutRequestID: `ws_CO_${Date.now()}`,
              ResultCode: 0,
              ResultDesc: "The service request is processed successfully.",
              CallbackMetadata: {
                Item: [
                  { Name: "Amount", Value: txn.amount },
                  { Name: "MpesaReceiptNumber", Value: txn.id },
                  { Name: "TransactionDate", Value: +txn.date.replace(/[-: ]/g, "") + "00" },
                  {
                    Name: "PhoneNumber",
                    Value: 254 + stk.phone.replace(/\D/g, "").replace(/^0/, ""),
                  },
                ],
              },
            },
          },
        },
        null,
        2,
      ),
    [txn.id, txn.amount, txn.date, stk.phone],
  );

  return (
    <>
      <h2>Payment received</h2>
      <div
        className="panel"
        style={{ boxShadow: "none", marginTop: 10, background: "var(--panel2)" }}
      >
        <div className="mono" style={{ fontSize: ".84rem", lineHeight: 1.55 }}>
          <b>{txn.id}</b> Confirmed. Ksh{group(txn.amount)}.00 sent to{" "}
          {company.name.toUpperCase()} for account {client.id} on {fmtDate(txn.date)}.
        </div>
      </div>
      <p>
        New balance: <BalanceChip balance={balance(s, client.id)} />
      </p>
      <details>
        <summary>Daraja callback (simulated)</summary>
        <pre className="code">{callback}</pre>
      </details>
      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn primary" onClick={() => actions.closeStk()}>
          Done
        </button>
      </div>
    </>
  );
}
