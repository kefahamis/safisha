"use client";

import {
  AlarmClock,
  ArrowLeft,
  CircleCheck,
  ClipboardList,
  History,
  Inbox,
  MessageSquare,
  Plus,
  Search,
  StickyNote,
  Ticket as TicketIcon,
  UserRound,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { CareChat, TOPICS } from "@/components/support/CareChat";
import { BalanceChip, Chip, StatusChip } from "@/components/ui/Chip";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate, stamp } from "@/lib/format";
import { estateName } from "@/lib/reference/estates";
import { balance, clientById, clientsOf, nowIn } from "@/lib/selectors";
import {
  CHANNELS,
  channelLabel,
  dueAt,
  duration,
  EVENT_TEXT,
  firstResponseMinutes,
  isOverdue,
  minutesBetween,
  PRIORITIES,
  priorityLabel,
  waitingOn,
  type TicketChannel,
  type TicketPriority,
} from "@/lib/tickets";
import type { Ticket, TicketStatus } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";
import { FormSheet } from "../fleet/FleetForms";

type View = "open" | "mine" | "unassigned" | "overdue" | "resolved" | "all";

const PRIORITY_TONE: Record<TicketPriority, "bad" | "warn" | "neutral" | "ok"> = {
  urgent: "bad",
  high: "warn",
  normal: "neutral",
  low: "ok",
};

export function PriorityChip({ priority }: { priority: TicketPriority }) {
  return <Chip tone={PRIORITY_TONE[priority] ?? "neutral"}>{priorityLabel(priority)}</Chip>;
}

const lastActivity = (t: Ticket) => t.msgs[t.msgs.length - 1]?.at ?? t.createdAt;

/**
 * The care desk as a ticketing system: every request with its priority,
 * deadline and owner, in queues the team works through. The conversation
 * itself is the same one the Chat agent screen shows.
 */
export function CompanyTickets() {
  const s = useAppState();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { session, can } = useSession();
  const [view, setView] = useState<View>("open");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("");
  const [cat, setCat] = useState("");
  const [creating, setCreating] = useState(false);

  const now = stamp(nowIn(s));
  const all = useMemo(() => s.tickets.filter((t) => t.company === s.companyId), [s.tickets, s.companyId]);
  const open = all.filter((t) => t.status !== "Resolved");
  const selectedId = params.get("id");
  const selected = all.find((t) => t.id === selectedId);
  const go = (id: string | null) => router.replace(id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname, { scroll: false });

  if (selected) return <TicketDetail ticket={selected} now={now} onBack={() => go(null)} />;

  const week = stamp(new Date(nowIn(s).getTime() - 7 * 86_400_000));
  const resolvedWeek = all.filter((t) => t.status === "Resolved" && (t.resolvedAt ?? lastActivity(t)) >= week);
  const responses = all.map(firstResponseMinutes).filter((m): m is number => m !== undefined);
  const avgResponse = responses.length ? responses.reduce((a, b) => a + b, 0) / responses.length : undefined;

  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((t) => {
      if (view === "open") return t.status !== "Resolved";
      if (view === "mine") return t.status !== "Resolved" && t.assignee === session?.sub;
      if (view === "unassigned") return t.status !== "Resolved" && !t.assignee;
      if (view === "overdue") return isOverdue(t, now);
      if (view === "resolved") return t.status === "Resolved";
      return true;
    })
    .filter((t) => !priority || t.priority === priority)
    .filter((t) => !cat || t.cat === cat)
    .filter((t) => {
      if (!needle) return true;
      const c = clientById(s, t.client);
      return [t.id, t.subject, c?.name ?? "", t.client].some((x) => x.toLowerCase().includes(needle));
    })
    // Most urgent first: overdue, then priority, then oldest deadline.
    .sort((a, b) => {
      const rank = (t: Ticket) => PRIORITIES.findIndex((p) => p.key === t.priority);
      return (
        Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
        Number(a.status === "Resolved") - Number(b.status === "Resolved") ||
        rank(a) - rank(b) ||
        dueAt(a).localeCompare(dueAt(b))
      );
    });

  const count = (v: View) =>
    v === "open"
      ? open.length
      : v === "mine"
        ? open.filter((t) => t.assignee === session?.sub).length
        : v === "unassigned"
          ? open.filter((t) => !t.assignee).length
          : v === "overdue"
            ? open.filter((t) => isOverdue(t, now)).length
            : v === "resolved"
              ? all.length - open.length
              : all.length;

  const categories = [...new Set([...TOPICS, ...all.map((t) => t.cat)])];

  return (
    <>
      <PageHead
        title="Tickets"
        icon={TicketIcon}
        actions={
          can("tickets.reply") && (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              New ticket
            </button>
          )
        }
      >
        Every request to the care desk, with its priority, deadline and owner. Replies go to the client in the app and by SMS.
      </PageHead>

      <div className="kpis">
        <Kpi label="Open" value={String(open.length)} sub={`${open.filter((t) => waitingOn(t) === "desk").length} waiting on us`} icon={Inbox} iconTone="warn" />
        <Kpi label="Unassigned" value={String(count("unassigned"))} sub="Nobody has taken them yet" icon={UserX} iconTone={count("unassigned") ? "bad" : "ok"} />
        <Kpi label="Overdue" value={String(count("overdue"))} sub="Past their deadline" icon={AlarmClock} iconTone={count("overdue") ? "bad" : "ok"} />
        <Kpi
          label="Resolved · 7 days"
          value={String(resolvedWeek.length)}
          sub={avgResponse !== undefined ? `First reply in ${duration(avgResponse)} on average` : "No replies yet"}
          icon={CircleCheck}
          iconTone="ok"
        />
      </div>

      <Panel>
        <div className="tk-toolbar">
          <div className="segmented" role="radiogroup" aria-label="Queue">
            {(
              [
                ["open", "Open"],
                ["mine", "Mine"],
                ["unassigned", "Unassigned"],
                ["overdue", "Overdue"],
                ["resolved", "Resolved"],
                ["all", "All"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}>
                {label} <span className="num">{count(k)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="search">
              <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              <input type="search" placeholder="Ticket, subject or client" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Any category</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {rows.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Client</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Deadline</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const c = clientById(s, t.client);
                  const due = dueAt(t);
                  const late = isOverdue(t, now);
                  return (
                    <tr key={t.id} className={`click${late ? " flagged" : ""}`} onClick={() => go(t.id)}>
                      <td className="wrap">
                        <div className="t">{t.subject}</div>
                        <div className="hint">
                          <span className="mono">{t.id}</span> · {t.cat} · {channelLabel(t.channel)}
                        </div>
                      </td>
                      <td>
                        {c?.name ?? t.client}
                        <div className="hint mono">{t.client}</div>
                      </td>
                      <td>
                        <PriorityChip priority={t.priority} />
                      </td>
                      <td>
                        <StatusChip status={t.status} />
                        {t.status !== "Resolved" && (
                          <div className="hint">{waitingOn(t) === "desk" ? "Waiting on us" : "Waiting on client"}</div>
                        )}
                      </td>
                      <td>{t.assigneeName ?? <span className="hint">Unassigned</span>}</td>
                      <td>
                        {t.status === "Resolved" ? (
                          <span className="hint">Resolved</span>
                        ) : late ? (
                          <span className="bad-text">{duration(minutesBetween(due, now))} late</span>
                        ) : (
                          <span>in {duration(minutesBetween(now, due))}</span>
                        )}
                        <div className="hint">{fmtDate(due)}</div>
                      </td>
                      <td className="hint">{fmtDate(lastActivity(t))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={ClipboardList}>{view === "mine" ? "Nothing assigned to you." : "No tickets in this queue."}</Empty>
        )}
      </Panel>

      {creating && <NewTicket onClose={() => setCreating(false)} onOpened={(id) => go(id)} />}
    </>
  );
}

/* ---------------- one ticket ---------------- */

function TicketDetail({ ticket, now, onBack }: { ticket: Ticket; now: string; onBack: () => void }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const [note, setNote] = useState("");
  const client = clientById(s, ticket.client);
  const due = dueAt(ticket);
  const late = isOverdue(ticket, now);
  const first = firstResponseMinutes(ticket);
  const mayChange = can("tickets.status");
  const history = [
    ...(ticket.events ?? []).map((e) => ({ at: e.at, key: `e${e.id}`, who: e.actorName, what: eventText(e.action, e.detail) })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const update = async (patch: Parameters<typeof actions.updateTicket>[1]) => {
    const res = await actions.updateTicket(ticket.id, patch);
    if (!res.ok) toast(res.error);
  };
  const setStatus = async (status: TicketStatus) => {
    const res = await actions.setTicketStatus(ticket.id, status);
    toast(res.ok ? `${ticket.id} ${status.toLowerCase()}` : res.error);
  };
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    const res = await actions.addTicketNote(ticket.id, note);
    toast(res.ok ? (res.message ?? "Note added") : res.error);
    if (res.ok) setNote("");
  };

  return (
    <>
      <div className="row between tk-detail-head">
        <button type="button" className="btn small ghost" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          All tickets
        </button>
        {late && (
          <Chip tone="bad" icon={AlarmClock}>
            {duration(minutesBetween(due, now))} past its deadline
          </Chip>
        )}
      </div>
      <PageHead title={ticket.subject} icon={TicketIcon}>
        <span className="mono">{ticket.id}</span> · {ticket.cat} · opened {fmtDate(ticket.createdAt)} by {channelLabel(ticket.channel).toLowerCase()}
      </PageHead>

      <div className="grid g-main tk-detail">
        <div className="stack">
          {client ? <CareChat me="agent" client={client} ticket={ticket} /> : <Empty>Client not found.</Empty>}
        </div>

        <div className="stack">
          <Panel title="Ticket" icon={ClipboardList}>
            <div className="tk-props">
              <label className="f">
                Status
                <select value={ticket.status} disabled={!mayChange} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                  {(["Open", "Pending", "Resolved"] as TicketStatus[]).map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
              </label>
              <label className="f">
                Priority
                <select value={ticket.priority} disabled={!mayChange} onChange={(e) => update({ priority: e.target.value as TicketPriority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} · {p.hours < 24 ? `${p.hours} h` : p.hours === 24 ? "1 day" : `${p.hours / 24} days`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="f">
                Owner
                <select value={ticket.assignee ?? ""} disabled={!mayChange} onChange={(e) => update({ assignee: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {s.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="f">
                Category
                <select value={ticket.cat} disabled={!mayChange} onChange={(e) => update({ cat: e.target.value })}>
                  {[...new Set([...TOPICS, ticket.cat])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="tk-facts">
              <div>
                <dt>Deadline</dt>
                <dd className={late ? "bad-text" : undefined}>{ticket.status === "Resolved" ? "Met" : fmtDate(due)}</dd>
              </div>
              <div>
                <dt>First reply</dt>
                <dd>{first !== undefined ? `after ${duration(first)}` : "Not yet"}</dd>
              </div>
              <div>
                <dt>Waiting on</dt>
                <dd>{ticket.status === "Resolved" ? "Nobody" : waitingOn(ticket) === "desk" ? "Us" : "The client"}</dd>
              </div>
              {ticket.resolvedAt && (
                <div>
                  <dt>Resolved</dt>
                  <dd>{fmtDate(ticket.resolvedAt)}</dd>
                </div>
              )}
            </dl>
          </Panel>

          {client && (
            <Panel title="Client" icon={UserRound}>
              <div className="t">{client.name}</div>
              <div className="hint">
                <span className="mono">{client.id}</span> · {estateName(client.estate)} · {client.type} · {client.phone}
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <BalanceChip balance={balance(s, client.id)} />
                {can("statements.view") && (
                  <Link
                    href="/company/statements"
                    className="btn small ghost"
                    onClick={() => actions.setStatementClient(client.id)}
                  >
                    Statement
                  </Link>
                )}
              </div>
              {(() => {
                const others = s.tickets.filter((t) => t.client === client.id && t.id !== ticket.id);
                return others.length ? (
                  <p className="hint" style={{ marginTop: 10 }}>
                    {others.length} other ticket{others.length === 1 ? "" : "s"}: {others.map((t) => t.id).join(", ")}
                  </p>
                ) : null;
              })()}
            </Panel>
          )}

          <Panel title="Internal notes" icon={StickyNote}>
            <p className="hint" style={{ marginTop: -4 }}>
              Only staff see these. The client never does.
            </p>
            {ticket.notes?.length ? (
              <div className="list">
                {ticket.notes.map((n) => (
                  <div className="tk-note" key={n.id ?? n.at}>
                    <div className="hint">
                      {n.by} · {fmtDate(n.at)}
                    </div>
                    <div>{n.text}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {can("tickets.reply") && (
              <form onSubmit={addNote} className="tk-note-form">
                <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the driver, he'll pass by at 2pm" />
                <button type="submit" className="btn small" disabled={!note.trim()}>
                  <StickyNote size={14} strokeWidth={2.2} aria-hidden="true" />
                  Add note
                </button>
              </form>
            )}
          </Panel>

          <Panel title="History" icon={History}>
            {history.length ? (
              <div className="list">
                {history.map((h) => (
                  <div className="li" key={h.key}>
                    <div>
                      <div className="t">{h.what}</div>
                      <div className="sub">{h.who}</div>
                    </div>
                    <span className="hint num">{fmtDate(h.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">Changes to status, priority and owner show here.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function eventText(action: string, d: Record<string, unknown>): string {
  if (action === "assign") return d.to ? `Assigned to ${d.to}${d.auto ? " (first to reply)" : ""}` : "Unassigned";
  if (action === "status" || action === "priority" || action === "category") return `${EVENT_TEXT[action]}: ${d.from} → ${d.to}`;
  if (action === "created") return `${EVENT_TEXT.created}${d.channel ? ` · ${channelLabel(String(d.channel))}` : ""}`;
  return EVENT_TEXT[action] ?? action;
}

/* ---------------- a ticket from a call or a visit ---------------- */

function NewTicket({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { session } = useSession();
  const clients = clientsOf(s, s.companyId).sort((a, b) => a.name.localeCompare(b.name));
  const [client, setClient] = useState(clients[0]?.id ?? "");
  const [find, setFind] = useState("");
  const [cat, setCat] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [channel, setChannel] = useState<TicketChannel>("phone");
  const [assignee, setAssignee] = useState(s.agents.some((a) => a.id === session?.sub) ? session!.sub : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needle = find.trim().toLowerCase();
  const shown = needle ? clients.filter((c) => `${c.name} ${c.id} ${c.phone}`.toLowerCase().includes(needle)) : clients;
  // What the picker shows is what gets submitted, even after the search hides the earlier choice.
  const picked = shown.some((c) => c.id === client) ? client : (shown[0]?.id ?? "");

  const submit = async () => {
    if (!picked) return setError("No client matches that search.");
    setBusy(true);
    setError("");
    const res = await actions.openTicket({ client: picked, cat, subject, message, priority, channel, assignee: assignee || null });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast(res.message ?? "Ticket opened");
    onClose();
    if (res.id) onOpened(res.id);
  };

  return (
    <FormSheet
      title="New ticket"
      icon={<MessageSquare size={19} strokeWidth={2.2} aria-hidden="true" />}
      wide
      onClose={onClose}
      onSubmit={submit}
      error={error}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Open ticket
          </button>
        </>
      }
    >
      <p className="hint">For a client who phoned, walked in or wrote. They get an SMS with the ticket number.</p>
      <div className="form" style={{ marginTop: 12 }}>
        <label className="f">
          Find client
          <input type="search" placeholder="Name, number or phone" value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
        <label className="f">
          Client
          <select value={picked} onChange={(e) => setClient(e.target.value)}>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.id}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          How they got in touch
          <select value={channel} onChange={(e) => setChannel(e.target.value as TicketChannel)}>
            {CHANNELS.filter((c) => c.key !== "app" && c.key !== "crew" && c.key !== "ussd").map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Category
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Owner
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {s.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="f" style={{ marginTop: 12 }}>
        Subject
        <input maxLength={80} required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Bin not collected on Monday" />
      </label>
      <label className="f" style={{ marginTop: 12 }}>
        What they said
        <textarea rows={3} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
    </FormSheet>
  );
}
