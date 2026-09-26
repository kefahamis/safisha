"use client";

import {
  ArrowRight,
  Calculator,
  CircleCheck,
  ClipboardList,
  Gauge,
  Headset,
  Hourglass,
  KeyRound,
  LayoutDashboard,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { permissionById } from "@/lib/auth/permissions";
import { fmtDate, kes } from "@/lib/format";
import { PICKUP_KINDS } from "@/lib/integrations";
import { balance, clientById, clientsOf, currentMonth, monthSum } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

interface Queue {
  key: string;
  title: string;
  icon: LucideIcon;
  count: number;
  /** What the count means, under the number. */
  unit: string;
  href: string;
  cta: string;
  rows: { id: string; title: ReactNode; sub: ReactNode }[];
  empty: string;
}

/**
 * A staff member's own dashboard: the work waiting for them, built from what
 * they're allowed to do. Someone on the care desk sees the inbox; someone in
 * finance sees payments to match and arrears; the workshop sees fleet alerts.
 */
export function StaffDesk() {
  const s = useAppState();
  const { session, can } = useSession();
  const co = s.companyId;
  const queues: Queue[] = [];

  if (can("tickets.view.company")) {
    const waiting = s.tickets.filter(
      (t) => t.company === co && t.status !== "Resolved" && t.msgs[t.msgs.length - 1]?.from === "client",
    );
    queues.push({
      key: "care",
      title: "Clients waiting for a reply",
      icon: Headset,
      count: waiting.length,
      unit: "conversations",
      href: "/company/support",
      cta: "Open the care inbox",
      rows: waiting.slice(0, 4).map((t) => ({
        id: t.id,
        title: t.subject,
        sub: `${clientById(s, t.client)?.name ?? t.client} · ${fmtDate(t.msgs[t.msgs.length - 1].at)}`,
      })),
      empty: "Nobody is waiting. The inbox is clear.",
    });
  }

  if (can("payments.reconcile")) {
    const unmatched = s.suspense.filter((p) => p.company === co);
    queues.push({
      key: "suspense",
      title: "Payments to match",
      icon: Wallet,
      count: unmatched.length,
      unit: kes(unmatched.reduce((a, p) => a + p.amount, 0)),
      href: "/company/payments",
      cta: "Match payments",
      rows: unmatched.slice(0, 4).map((p) => ({ id: p.id, title: `${kes(p.amount)} from ${p.payer}`, sub: `Typed ${p.account} · ${p.reason}` })),
      empty: "Every M-Pesa payment is matched to a client.",
    });
  }

  if (can("reminders.manage") || can("payments.view")) {
    const owing = clientsOf(s, co)
      .map((c) => ({ c, bal: balance(s, c.id) }))
      .filter((x) => x.bal > x.c.plan)
      .sort((a, b) => b.bal - a.bal);
    queues.push({
      key: "arrears",
      title: "Two months or more behind",
      icon: Hourglass,
      count: owing.length,
      unit: kes(owing.reduce((a, x) => a + x.bal, 0)),
      href: "/company/arrears",
      cta: "Arrears and reminders",
      rows: owing.slice(0, 4).map(({ c, bal }) => ({ id: c.id, title: c.name, sub: `${c.id} · owes ${kes(bal)}` })),
      empty: "No client is more than a month behind.",
    });
  }

  if (can("pickups.manage")) {
    const requested = s.pickupRequests.filter((r) => r.company === co && r.status === "Requested");
    queues.push({
      key: "pickups",
      title: "Pickups to schedule",
      icon: ClipboardList,
      count: requested.length,
      unit: "requests",
      href: "/company/pickups",
      cta: "Schedule pickups",
      rows: requested.slice(0, 4).map((r) => ({
        id: r.id,
        title: `${PICKUP_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind} · ${clientById(s, r.client)?.name ?? r.client}`,
        sub: `${r.id} · wanted ${fmtDate(r.preferredDate)}`,
      })),
      empty: "No pickup requests are waiting.",
    });
  }

  if (can("dumping.manage")) {
    const reports = s.dumpReports.filter((d) => d.company === co && d.status === "New");
    queues.push({
      key: "dumping",
      title: "New dumping reports",
      icon: TriangleAlert,
      count: reports.length,
      unit: "sites to clear",
      href: "/company/dumping",
      cta: "Dumping reports",
      rows: reports.slice(0, 4).map((d) => ({ id: d.id, title: d.description, sub: `${d.id} · ${d.size} · ${fmtDate(d.createdAt)}` })),
      empty: "No new dumping reports.",
    });
  }

  if (can("fleet.manage")) {
    queues.push({
      key: "fleet",
      title: "Fleet needs attention",
      icon: Gauge,
      count: s.fleet.alerts.length,
      unit: `${s.fleet.alerts.filter((a) => a.severity === "bad").length} urgent`,
      href: "/company/fleet",
      cta: "Fleet management",
      rows: s.fleet.alerts.slice(0, 4).map((a) => ({ id: a.id, title: a.title, sub: a.body })),
      empty: "Papers, services and checks are all in order.",
    });
  }

  const firstName = session?.name.split(" ")[0] ?? "";
  const month = currentMonth(s);
  const access = [...(session?.permissions ?? [])].map((p) => permissionById(p)?.label ?? p).sort();
  const shortcuts: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/company/clients", label: "Clients", icon: Users, show: can("clients.view") },
    { href: "/company/statements", label: "Statements", icon: Calculator, show: can("statements.view") },
    { href: "/company/finance", label: "Financial reports", icon: Calculator, show: can("finance.view") },
  ];

  return (
    <>
      <PageHead title={`Habari, ${firstName}`} icon={LayoutDashboard}>
        {session?.department ? `${session.department.name} · ` : ""}
        Here&rsquo;s what&rsquo;s waiting for you today.
      </PageHead>

      {queues.length > 0 && (
        <div className="kpis">
          {queues.map((q) => (
            <Kpi key={q.key} label={q.title} value={String(q.count)} sub={q.unit} icon={q.icon} iconTone={q.count ? "warn" : "ok"} />
          ))}
          {can("payments.view") && (
            <Kpi label={`Collected in ${month}`} value={kes(monthSum(s, co, "payment"))} sub={`of ${kes(monthSum(s, co, "charge"))} billed`} icon={Wallet} iconTone="sky" />
          )}
        </div>
      )}

      {queues.length ? (
        <div className="desk-grid">
          {queues.map((q) => (
            <Panel
              key={q.key}
              title={q.title}
              icon={q.icon}
              aside={<span className={`chip ${q.count ? "warn" : "ok"}`}>{q.count}</span>}
            >
              {q.rows.length ? (
                <div className="list">
                  {q.rows.map((r) => (
                    <div className="li" key={r.id}>
                      <div style={{ minWidth: 0 }}>
                        <div className="t">{r.title}</div>
                        <div className="sub">{r.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint with-ico">
                  <CircleCheck size={15} strokeWidth={2.2} aria-hidden="true" />
                  {q.empty}
                </p>
              )}
              <Link href={q.href} className="btn small desk-cta">
                {q.cta}
                <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty icon={LayoutDashboard}>Nothing is assigned to you yet. Your company admin chooses what your department can do.</Empty>
        </Panel>
      )}

      <div className="grid g2">
        {shortcuts.some((x) => x.show) && (
          <Panel title="Shortcuts" icon={ArrowRight}>
            <div className="row" style={{ gap: 8 }}>
              {shortcuts
                .filter((x) => x.show)
                .map((x) => (
                  <Link key={x.href} href={x.href} className="btn small">
                    <x.icon size={14} strokeWidth={2.2} aria-hidden="true" />
                    {x.label}
                  </Link>
                ))}
            </div>
          </Panel>
        )}
        <Panel title="What you can do" icon={KeyRound}>
          <p className="hint" style={{ marginTop: -4 }}>
            {session?.department ? `From the ${session.department.name} department` : `As ${session?.roleName}`}, plus any changes your
            company admin made for you.
          </p>
          <div className="access-chips">
            {access.map((a) => (
              <span key={a} className="chip neutral">
                {a}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
