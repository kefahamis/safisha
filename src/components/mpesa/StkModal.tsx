"use client";

import {
  Banknote,
  BatteryFull,
  Braces,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Phone,
  RotateCcw,
  Send,
  Signal,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BalanceChip } from "@/components/ui/Chip";
import { fmtDate, group } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { balance, clientById } from "@/lib/selectors";
import { useT } from "@/lib/i18n";
import { useActions, useAppState } from "@/store/StoreProvider";

/**
 * Lipa na M-Pesa Online (STK Push): form, then either the customer's real phone
 * (live Daraja) or a drawn handset (simulated), then the result.
 */
export function StkModal() {
  const s = useAppState();
  const actions = useActions();
  const { t } = useT();
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t("Pay with M-Pesa")}>
        {stk.step === "form" && <StkForm />}

        {stk.step === "phone" && (
          <>
            <div className="sheet-icon accent" aria-hidden="true">
              <Smartphone size={24} strokeWidth={2} />
            </div>
            <h2>{t("Check your phone")}</h2>
            <p className="hint">
              {t(
                "This is what appears on {phone}. The PIN is entered on the phone, never on this site.",
                {
                  phone: stk.phone,
                },
              )}
            </p>
            <div className="phone">
              <div className="scr">
                <div className="hdr">
                  <span className="with-ico">
                    <Signal size={11} strokeWidth={2.4} aria-hidden="true" />
                    Safaricom
                  </span>
                  <span className="with-ico">
                    10:15
                    <BatteryFull size={13} strokeWidth={2.2} aria-hidden="true" />
                  </span>
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
                    onClick={() => void actions.simulateStk(true)}
                  >
                    <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                    {t("Approve (simulate)")}
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void actions.simulateStk(false)}
                  >
                    <X size={14} strokeWidth={2.2} aria-hidden="true" />
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {stk.step === "wait" && (
          <>
            <div className="sheet-icon accent" aria-hidden="true">
              <LoaderCircle size={24} strokeWidth={2} className="spin" />
            </div>
            {stk.mode === "live" ? (
              <>
                <h2>{t("Check your phone")}</h2>
                <p className="hint">
                  {t(
                    "An M-Pesa prompt for KES {amount} was sent to {phone}. Enter your PIN there; this updates by itself once Safaricom confirms.",
                    { amount: group(stk.amount), phone: stk.phone },
                  )}
                </p>
              </>
            ) : (
              <>
                <h2>{t("Confirming payment…")}</h2>
                <p className="hint">{t("Waiting for the payment confirmation.")}</p>
              </>
            )}
          </>
        )}

        {stk.step === "done" && stk.txn && <StkReceipt />}

        {stk.step === "declined" && (
          <>
            <div className="sheet-icon bad" aria-hidden="true">
              <CircleX size={24} strokeWidth={2} />
            </div>
            <h2>{t("Payment not completed")}</h2>
            <p>
              {stk.error ?? t("The request was cancelled on the phone.")}{" "}
              {t("Nothing was charged.")}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  actions.openStk(stk.client, { amount: stk.amount, purpose: stk.purpose })
                }
              >
                <RotateCcw size={16} strokeWidth={2.2} aria-hidden="true" />
                {t("Try again")}
              </button>
              <button type="button" className="btn ghost" onClick={() => actions.closeStk()}>
                {t("Close")}
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
  const { t } = useT();
  const stk = s.stk!;
  const [phone, setPhone] = useState(stk.phone);
  const [amount, setAmount] = useState(String(stk.amount));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const live = stk.mode === "live";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await actions.submitStk(phone, Number(amount));
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <>
      <div className="sheet-icon ok" aria-hidden="true">
        <Smartphone size={24} strokeWidth={2} />
      </div>
      <h2>{t("Pay with M-Pesa")}</h2>
      <p className="hint">{t("We’ll send a payment prompt to your phone (STK Push).")}</p>
      <span className={`chip ${live ? "ok" : "neutral"}`} style={{ marginBottom: 12 }}>
        {t(live ? "Live M-Pesa" : "Simulated: no money moves")}
      </span>
      <form className="stack" onSubmit={submit}>
        <label className="f">
          {t("M-Pesa phone number")}
          <span className="field">
            <Phone size={15} strokeWidth={2.2} aria-hidden="true" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              required
            />
          </span>
        </label>
        <label className="f">
          {t("Amount (KES)")}
          <span className="field">
            <Banknote size={15} strokeWidth={2.2} aria-hidden="true" />
            <input
              type="number"
              min={10}
              max={150000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </span>
        </label>
        {error && (
          <div className="err">
            <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
            {error}
          </div>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
            ) : (
              <Send size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
            {busy ? t("Sending…") : t("Send prompt")}
          </button>
          <button type="button" className="btn ghost" onClick={() => actions.closeStk()}>
            {t("Cancel")}
          </button>
        </div>
      </form>
    </>
  );
}

function StkReceipt() {
  const s = useAppState();
  const actions = useActions();
  const { t } = useT();
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
              CheckoutRequestID: `ws_CO_${txn.id}`,
              ResultCode: 0,
              ResultDesc: "The service request is processed successfully.",
              CallbackMetadata: {
                Item: [
                  { Name: "Amount", Value: txn.amount },
                  { Name: "MpesaReceiptNumber", Value: txn.id },
                  {
                    Name: "TransactionDate",
                    Value: +(txn.date || "").replace(/[-: ]/g, "") + "00",
                  },
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
      <div className="sheet-icon ok pop" aria-hidden="true">
        <CircleCheck size={26} strokeWidth={2} />
      </div>
      <h2>{t("Payment received")}</h2>
      <div
        className="panel"
        style={{ boxShadow: "none", marginTop: 10, background: "var(--panel2)" }}
      >
        <div className="mono" style={{ fontSize: ".84rem", lineHeight: 1.55 }}>
          <b>{txn.id}</b> Confirmed. Ksh{group(txn.amount)}.00 sent to {company.name.toUpperCase()}{" "}
          for account {client.id}
          {txn.date ? ` on ${fmtDate(txn.date)}` : ""}.
        </div>
      </div>
      <p>
        {t("New balance:")} <BalanceChip balance={balance(s, client.id)} />
      </p>
      {stk.mode !== "live" && (
        <details>
          <summary>
            <Braces size={15} strokeWidth={2.2} aria-hidden="true" />
            Daraja callback (simulated)
            <ChevronDown size={15} strokeWidth={2.2} className="chev" aria-hidden="true" />
          </summary>
          <pre className="code">{callback}</pre>
        </details>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn primary" onClick={() => actions.closeStk()}>
          <Check size={16} strokeWidth={2.2} aria-hidden="true" />
          {t("Done")}
        </button>
      </div>
    </>
  );
}
