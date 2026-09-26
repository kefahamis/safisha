"use client";

import {
  BookOpen,
  BookText,
  Calculator,
  Download,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTabStrip } from "@/components/ui/useTabStrip";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { balanceSheet, profitAndLoss, type JournalEntry, type Period } from "@/lib/accounting";
import { kes, pad, stamp } from "@/lib/format";
import { companyById } from "@/lib/reference/companies";
import { nowIn } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";
import { filterJournal, journalCsv, JournalView, ledgerCsv, LedgerView } from "./Books";
import { JournalForm } from "./JournalForm";
import { downloadCsv } from "./money";
import {
  BalanceSheetView,
  balanceSheetCsv,
  ProfitLossView,
  profitLossCsv,
  TrialBalanceView,
  trialBalanceCsv,
} from "./Statements";

type Tab = "pl" | "bs" | "tb" | "journal" | "ledgers";
type Preset = "month" | "last-month" | "year" | "all" | "custom";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "pl", label: "Profit & loss", icon: TrendingUp },
  { id: "bs", label: "Balance sheet", icon: Scale },
  { id: "tb", label: "Trial balance", icon: Calculator },
  { id: "journal", label: "Journal", icon: BookText },
  { id: "ledgers", label: "Ledgers", icon: BookOpen },
];

/** Reports that show a position at a date rather than activity over a span. */
const POINT_IN_TIME: Tab[] = ["bs", "tb"];

function presetPeriod(preset: Preset, today: string): Period {
  const [y, m] = today.split("-").map(Number);
  if (preset === "month") return { from: `${y}-${pad(m)}-01`, to: today };
  if (preset === "last-month") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(py, pm, 0).getDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
  }
  if (preset === "year") return { from: `${y}-01-01`, to: today };
  return { from: "", to: today };
}

export function FinanceCenter() {
  const s = useAppState();
  const toast = useToast();
  const company = s.companyId;
  const today = stamp(nowIn(s)).slice(0, 10);

  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("pl");
  const tabStrip = useTabStrip<HTMLDivElement>(tab);
  const [preset, setPreset] = useState<Preset>("year");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("year", today));
  const [account, setAccount] = useState("1000");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/finance/${company}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't load the books.");
      return;
    }
    setError("");
    setEntries(body.entries);
    setCanPost(Boolean(body.canPost));
  }, [company]);

  // Reload when the company changes, and when a sync brings new charges or payments.
  const activity = `${s.txns.length}|${s.suspense.length}`;
  useEffect(() => {
    void load();
  }, [load, activity]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setPeriod(presetPeriod(p, today));
  };

  const openAccount = (code: string) => {
    setAccount(code);
    setTab("ledgers");
  };

  const openEntry = (id: string) => {
    setQ(id);
    setSource("");
    setTab("journal");
  };

  const reverse = async (id: string) => {
    if (!window.confirm(`Reverse ${id}? A mirror-image entry dated today will cancel it.`)) return;
    const res = await fetch(`/api/finance/${company}/journals/${id}/reverse`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast(body.error ?? "Couldn't reverse that entry.");
    toast(`${id} reversed by ${body.id}.`);
    void load();
  };

  const exportCsv = () => {
    if (!entries) return;
    const name = (report: string) => `${company}-${report}-${period.to}.csv`;
    if (tab === "tb") downloadCsv(name("trial-balance"), trialBalanceCsv(entries, period.to));
    if (tab === "pl") downloadCsv(name("profit-and-loss"), profitLossCsv(entries, period));
    if (tab === "bs") downloadCsv(name("balance-sheet"), balanceSheetCsv(entries, period.to));
    if (tab === "journal") downloadCsv(name("journal"), journalCsv(filterJournal(entries, period, source, q)));
    if (tab === "ledgers") downloadCsv(name(`ledger-${account}`), ledgerCsv(entries, account, period));
  };

  const pl = entries ? profitAndLoss(entries, period) : null;
  const bs = entries ? balanceSheet(entries, period.to) : null;
  const cash = bs?.assets.flatMap((x) => x.lines).filter((l) => ["1000", "1010", "1020"].includes(l.account.code)) ?? [];
  const receivable = bs?.assets.flatMap((x) => x.lines).find((l) => l.account.code === "1100")?.amount ?? 0;
  const pointInTime = POINT_IN_TIME.includes(tab);

  return (
    <>
      <PageHead
        title="Financial reports"
        icon={Landmark}
        actions={
          canPost ? (
            <button type="button" className="btn primary" onClick={() => setComposing(true)}>
              <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
              New journal entry
            </button>
          ) : undefined
        }
      >
        {companyById(company).name}’s books. Billing, M-Pesa receipts and unmatched payments post
        automatically; expenses and adjustments are journal entries.
      </PageHead>

      {pl && bs && (
        <div className="kpis">
          <Kpi label="Revenue" value={kes(pl.totalIncome)} sub="In the period" icon={TrendingUp} />
          <Kpi label="Expenses" value={kes(pl.totalExpenses)} sub="In the period" icon={HandCoins} iconTone="warn" />
          <Kpi
            label={pl.net >= 0 ? "Net profit" : "Net loss"}
            value={kes(Math.abs(pl.net))}
            tone={pl.net < 0 ? "bad" : undefined}
            sub={pl.totalIncome ? `${Math.round((pl.net / pl.totalIncome) * 100)}% margin` : "No revenue yet"}
            icon={Calculator}
            iconTone={pl.net < 0 ? "bad" : "ok"}
          />
          <Kpi
            label="Cash & M-Pesa"
            value={kes(cash.reduce((sum, l) => sum + l.amount, 0))}
            sub={`At ${period.to}`}
            icon={Wallet}
            iconTone="sky"
          />
          <Kpi label="Receivables" value={kes(receivable)} sub={`At ${period.to}`} icon={FileSpreadsheet} iconTone="violet" />
        </div>
      )}

      <Panel>
        <div className="tabs" role="tablist" aria-label="Reports" ref={tabStrip}>
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              className="tab"
              onClick={() => setTab(x.id)}
            >
              <x.icon size={15} strokeWidth={2.2} aria-hidden="true" />
              {x.label}
            </button>
          ))}
        </div>

        <div className="fin-controls">
          <label className="f">
            Period
            <select value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
              <option value="month">This month</option>
              <option value="last-month">Last month</option>
              <option value="year">Year to date</option>
              <option value="all">All time</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {!pointInTime && (
            <label className="f">
              From
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={(e) => {
                  setPreset("custom");
                  setPeriod((p) => ({ ...p, from: e.target.value }));
                }}
              />
            </label>
          )}
          <label className="f">
            {pointInTime ? "As at" : "To"}
            <input
              type="date"
              value={period.to}
              min={pointInTime ? undefined : period.from || undefined}
              max={today}
              required
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset("custom");
                setPeriod((p) => ({ ...p, to: e.target.value }));
              }}
            />
          </label>
          <div className="fin-controls-actions">
            <button type="button" className="btn small ghost icon-only" onClick={() => void load()} aria-label="Reload" title="Reload">
              <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button type="button" className="btn small" onClick={exportCsv} disabled={!entries}>
              <Download size={15} strokeWidth={2.2} aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        {error && <div className="banner">{error}</div>}
        {!entries && !error && <Empty icon={RefreshCw}>Loading the books…</Empty>}

        {entries && tab === "pl" && <ProfitLossView entries={entries} period={period} onAccount={openAccount} />}
        {entries && tab === "bs" && <BalanceSheetView entries={entries} asOf={period.to} onAccount={openAccount} />}
        {entries && tab === "tb" && <TrialBalanceView entries={entries} asOf={period.to} onAccount={openAccount} />}
        {entries && tab === "journal" && (
          <JournalView
            entries={entries}
            period={period}
            q={q}
            onQuery={setQ}
            source={source}
            onSource={setSource}
            canPost={canPost}
            onReverse={(id) => void reverse(id)}
            onAccount={openAccount}
          />
        )}
        {entries && tab === "ledgers" && (
          <LedgerView entries={entries} period={period} account={account} onAccount={setAccount} onEntry={openEntry} />
        )}
      </Panel>

      {composing && (
        <JournalForm
          company={company}
          today={today}
          onClose={() => setComposing(false)}
          onPosted={(id) => {
            setComposing(false);
            toast(`Posted ${id}.`);
            void load();
          }}
        />
      )}
    </>
  );
}
