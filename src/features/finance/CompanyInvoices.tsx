"use client";

import { AlarmClock, Download, FileText, Printer, ReceiptText, Search, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Chip } from "@/components/ui/Chip";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, kes, MONTHS, stamp } from "@/lib/format";
import { INVOICE_STATUS_LABEL, INVOICE_TERMS_DAYS, invoicesFor, type Invoice, type InvoiceStatus } from "@/lib/invoices";
import { companyById } from "@/lib/reference/companies";
import { estateName } from "@/lib/reference/estates";
import { clientById, clientsOf, nowIn } from "@/lib/selectors";
import { useActions, useAppState } from "@/store/StoreProvider";
import { downloadCsv } from "./money";

const STATUS_TONE: Record<InvoiceStatus, "ok" | "warn" | "bad" | "neutral"> = {
  paid: "ok",
  partly_paid: "warn",
  unpaid: "neutral",
  overdue: "bad",
};

export function InvoiceChip({ status }: { status: InvoiceStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</Chip>;
}

const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

/** Every charge raised on a client, with what's been paid against it. */
export function CompanyInvoices() {
  const s = useAppState();
  const co = companyById(s.companyId);
  const today = stamp(nowIn(s)).slice(0, 10);
  const invoices = invoicesFor(s.txns, clientsOf(s, co.id), today);
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [month, setMonth] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const months = [...new Set(invoices.map((i) => i.issued.slice(0, 7)))].sort().reverse();
  const thisMonth = today.slice(0, 7);
  const monthly = invoices.filter((i) => i.issued.startsWith(thisMonth));
  const overdue = invoices.filter((i) => i.status === "overdue");
  const needle = q.trim().toLowerCase();
  const rows = invoices
    .filter((i) => !status || i.status === status)
    .filter((i) => !month || i.issued.startsWith(month))
    .filter((i) => {
      if (!needle) return true;
      const c = clientById(s, i.client);
      return [i.id, i.client, c?.name ?? "", i.description].some((x) => x.toLowerCase().includes(needle));
    });
  const selected = invoices.find((i) => i.id === open);

  const exportCsv = () =>
    downloadCsv(`${co.id}-invoices${month ? `-${month}` : ""}.csv`, [
      ["Invoice", "Client no.", "Client", "Issued", "Due", "Description", "Amount", "Paid", "Balance", "Status"],
      ...rows.map((i) => [
        i.id,
        i.client,
        clientById(s, i.client)?.name ?? "",
        i.issued.slice(0, 10),
        i.due,
        i.description,
        i.amount,
        i.paid,
        i.balance,
        INVOICE_STATUS_LABEL[i.status],
      ]),
    ]);

  return (
    <>
      <PageHead title="Invoices" icon={ReceiptText}>
        Every monthly collection fee and on-demand pickup billed to {co.name}&rsquo;s clients. Payments settle the oldest invoice
        first; each is due {INVOICE_TERMS_DAYS} days after it&rsquo;s raised.
      </PageHead>

      <div className="kpis">
        <Kpi label={`Invoiced · ${monthLabel(thisMonth)}`} value={kes(monthly.reduce((a, i) => a + i.amount, 0))} sub={`${monthly.length} invoices`} icon={FileText} />
        <Kpi
          label={`Paid · ${monthLabel(thisMonth)}`}
          value={kes(monthly.reduce((a, i) => a + i.paid, 0))}
          sub={`${monthly.filter((i) => i.status === "paid").length} settled in full`}
          progress={monthly.length ? (monthly.reduce((a, i) => a + i.paid, 0) / Math.max(1, monthly.reduce((a, i) => a + i.amount, 0))) * 100 : 0}
          icon={Wallet}
          iconTone="ok"
        />
        <Kpi label="Outstanding" value={kes(invoices.reduce((a, i) => a + i.balance, 0))} sub={`${invoices.filter((i) => i.balance > 0).length} invoices open`} icon={ReceiptText} iconTone="warn" />
        <Kpi
          label="Overdue"
          value={kes(overdue.reduce((a, i) => a + i.balance, 0))}
          sub={`${overdue.length} past their due date`}
          icon={AlarmClock}
          iconTone={overdue.length ? "bad" : "ok"}
          tone={overdue.length ? "bad" : undefined}
        />
      </div>

      <Panel>
        <div className="tk-toolbar">
          <div className="segmented" role="radiogroup" aria-label="Status">
            {([["", "All"], ["overdue", "Overdue"], ["unpaid", "Unpaid"], ["partly_paid", "Part paid"], ["paid", "Paid"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={status === k} onClick={() => setStatus(k)}>
                {label} <span className="num">{k ? invoices.filter((i) => i.status === k).length : invoices.length}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="search">
              <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              <input type="search" placeholder="Invoice, client or number" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button type="button" className="btn small ghost" onClick={exportCsv} disabled={!rows.length}>
              <Download size={14} strokeWidth={2.2} aria-hidden="true" />
              CSV
            </button>
          </div>
        </div>

        {rows.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className="r">Amount</th>
                  <th className="r">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((i) => {
                  const c = clientById(s, i.client);
                  return (
                    <tr key={i.id} className="click" onClick={() => setOpen(i.id)}>
                      <td className="wrap">
                        <div className="mono t">{i.id}</div>
                        <div className="hint">{i.description}</div>
                      </td>
                      <td>
                        {c?.name ?? i.client}
                        <div className="hint mono">{i.client}</div>
                      </td>
                      <td>{fmtDate(i.issued.slice(0, 10))}</td>
                      <td className={i.status === "overdue" ? "bad-text" : undefined}>{fmtDate(i.due)}</td>
                      <td className="r num">{kes(i.amount)}</td>
                      <td className="r num">{i.balance ? kes(i.balance) : "—"}</td>
                      <td>
                        <InvoiceChip status={i.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={ReceiptText}>No invoices match.</Empty>
        )}
        {rows.length > 200 && <p className="hint">Showing the latest 200; narrow by month or export to CSV for all.</p>}
      </Panel>

      {selected && <InvoiceSheet invoice={selected} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One invoice as a document the client could be handed or sent, with print and SMS. */
function InvoiceSheet({ invoice: i, onClose }: { invoice: Invoice; onClose: () => void }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const [sending, setSending] = useState(false);
  const c = clientById(s, i.client);
  const co = companyById(i.company);

  const send = async () => {
    setSending(true);
    const res = await actions.sendInvoice(i.id);
    setSending(false);
    toast(res.ok ? (res.message ?? "Sent") : res.error);
  };

  return (
    <div className="modal invoice-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet fleet-sheet wide" role="dialog" aria-modal="true" aria-label={`Invoice ${i.id}`}>
        <div className="row between no-print" style={{ marginBottom: 14 }}>
          <InvoiceChip status={i.status} />
          <div className="row" style={{ gap: 8 }}>
            {can("reminders.manage") && i.balance > 0 && (
              <button type="button" className="btn small" onClick={send} disabled={sending}>
                <Send size={14} strokeWidth={2.2} aria-hidden="true" />
                Send by SMS
              </button>
            )}
            <button type="button" className="btn small primary" onClick={() => window.print()}>
              <Printer size={14} strokeWidth={2.2} aria-hidden="true" />
              Print or save PDF
            </button>
            <button type="button" className="btn small ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <article className="invoice-doc">
          <header className="invoice-head">
            <div>
              <h2>{co.name}</h2>
              <div className="hint">
                M-Pesa Paybill {co.paybill} · Care {co.care}
              </div>
            </div>
            <div className="invoice-title">
              <div className="label">Invoice</div>
              <div className="mono">{i.id}</div>
            </div>
          </header>

          <div className="invoice-meta">
            <div>
              <div className="label">Billed to</div>
              <b>{c?.name ?? i.client}</b>
              <div>Account {i.client}</div>
              {c && (
                <div className="hint">
                  {estateName(c.estate)} · {c.phone}
                </div>
              )}
            </div>
            <dl>
              <div>
                <dt>Issued</dt>
                <dd>{fmtDate(i.issued.slice(0, 10))}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{fmtDate(i.due)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{INVOICE_STATUS_LABEL[i.status]}</dd>
              </div>
            </dl>
          </div>

          <table className="invoice-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{i.description}</td>
                <td className="r num">{kes(i.amount)}</td>
              </tr>
              {i.payments.map((p) => (
                <tr key={`${p.id}-${p.date}`} className="invoice-paid">
                  <td>
                    Paid {fmtDate(p.date)}
                    {p.channel ? ` · ${p.channel}` : ""} · <span className="mono">{p.id}</span>
                  </td>
                  <td className="r num">−{kes(p.amount)}</td>
                </tr>
              ))}
              <tr className="invoice-total">
                <td>Balance due</td>
                <td className="r num">{kes(i.balance)}</td>
              </tr>
            </tbody>
          </table>

          {i.balance > 0 ? (
            <div className="invoice-pay">
              <b>How to pay</b>
              <div>
                M-Pesa → Lipa na M-Pesa → Paybill <b className="mono">{co.paybill}</b>, account number <b className="mono">{i.client}</b>,
                amount <b>{kes(i.balance)}</b>. It posts to the account within a minute.
              </div>
            </div>
          ) : (
            <div className="invoice-pay paid">Paid in full. Thank you.</div>
          )}
        </article>
      </div>
    </div>
  );
}
