"use client";

import {
  Bell,
  Building2,
  CircleCheck,
  CircleDashed,
  Globe,
  Inbox,
  Languages,
  Mail,
  MessageSquareText,
  Palette,
  PhoneCall,
  RefreshCw,
  Settings,
  Smartphone,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTabStrip } from "@/components/ui/useTabStrip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import type { IntegrationKey, IntegrationView } from "@/lib/integrations";
import { COMPANIES, companyById } from "@/lib/reference/companies";
import { PLATFORM } from "@/lib/branding";
import { BrandingSettings } from "./BrandingSettings";
import { IntegrationCard } from "./IntegrationCard";
import { UssdTester } from "./UssdTester";

const ICONS: Record<IntegrationKey, LucideIcon> = {
  mpesa: Smartphone,
  reminders: Bell,
  pricing: Tags,
  sms: MessageSquareText,
  ussd: PhoneCall,
  email: Mail,
  ai: Languages,
  app: Globe,
};

interface ScopeData {
  integrations: IntegrationView[];
  platform: { publicBaseUrl: string | null; sms: string; email: string; ai: string };
}

type Tab = "payments" | "branding" | "platform-brand" | "messaging" | "translation" | "billing" | "system" | "activity";

/**
 * Settings for everything third-party, in one place. A company admin manages
 * their own M-Pesa, reminders and prices; the platform admin manages SMS, USSD,
 * email, translation and the public address — and any company's settings.
 */
export function SettingsCenter({ platform, companyId }: { platform: boolean; companyId?: string }) {
  const [company, setCompany] = useState(companyId ?? COMPANIES[0].id);
  const [tab, setTab] = useState<Tab>("payments");
  const tabStrip = useTabStrip<HTMLDivElement>(tab);
  const [companyData, setCompanyData] = useState<ScopeData | null>(null);
  const [platformData, setPlatformData] = useState<ScopeData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const get = async (scope: string) => {
      const res = await fetch(`/api/settings/${scope}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load settings.");
      return body as ScopeData;
    };
    try {
      const [c, p] = await Promise.all([get(company), platform ? get("platform") : Promise.resolve(null)]);
      setCompanyData(c);
      setPlatformData(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings.");
    }
  }, [company, platform]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (setter: typeof setCompanyData) => (view: IntegrationView) =>
    setter((d) => (d ? { ...d, integrations: d.integrations.map((i) => (i.key === view.key ? view : i)) } : d));

  const card = (data: ScopeData | null, key: IntegrationKey, setter: typeof setCompanyData, extra?: React.ReactNode) => {
    const view = data?.integrations.find((i) => i.key === key);
    if (!view) return null;
    return (
      <IntegrationCard
        key={`${view.scope}/${key}`}
        view={view}
        icon={ICONS[key]}
        onChange={replace(setter)}
        extra={extra}
      />
    );
  };

  const tabs: { id: Tab; label: string; icon: LucideIcon; platformOnly?: boolean }[] = [
    { id: "payments", label: "Payments", icon: Smartphone },
    { id: "billing", label: "Billing & prices", icon: Bell },
    { id: "branding", label: "Branding", icon: Palette },
    { id: "platform-brand", label: "Platform brand", icon: Globe, platformOnly: true },
    { id: "messaging", label: "SMS, USSD & email", icon: MessageSquareText, platformOnly: true },
    { id: "translation", label: "Translation", icon: Languages, platformOnly: true },
    { id: "system", label: "Public address", icon: Globe, platformOnly: true },
    { id: "activity", label: "Activity", icon: Inbox },
  ];

  const mpesa = companyData?.integrations.find((i) => i.key === "mpesa");
  const base = companyData?.platform.publicBaseUrl;

  return (
    <>
      <PageHead
        title="Settings"
        icon={Settings}
        actions={
          platform ? (
            <label className="select-ico">
              <Building2 size={15} strokeWidth={2.2} aria-hidden="true" />
              <select aria-label="Company" value={company} onChange={(e) => setCompany(e.target.value)}>
                {COMPANIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      >
        Payments and third-party services. Keys are encrypted when saved and never shown again.
      </PageHead>

      <div className="tabs" role="tablist" aria-label="Settings sections" ref={tabStrip}>
        {tabs
          .filter((t) => platform || !t.platformOnly)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="tab"
              onClick={() => setTab(t.id)}
            >
              <t.icon size={15} strokeWidth={2.2} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        <button type="button" className="btn small ghost icon-only" onClick={load} aria-label="Reload" title="Reload">
          <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {error && <div className="banner">{error}</div>}
      {!companyData && !error && <Empty icon={RefreshCw}>Loading settings…</Empty>}

      {tab === "branding" && <BrandingSettings key={company} scope={company} />}
      {tab === "platform-brand" && <BrandingSettings key="platform" scope={PLATFORM} />}

      {companyData && tab === "payments" && (
        <div className="settings-grid">
          <Panel title="Going live" icon={CircleCheck} className="golive">
            <p className="hint" style={{ marginTop: -6 }}>
              {companyById(company).name} payments switch from the simulator to real M-Pesa when these are done.
            </p>
            <ol className="checklist">
              <Step done={Boolean(base?.startsWith("https://"))} title="Public HTTPS address">
                {base ? base : platform ? "Set it under Public address." : "Set by the platform admin."}
              </Step>
              <Step
                done={Boolean(mpesa && mpesa.secrets.consumerKey?.saved && mpesa.secrets.passkey?.saved)}
                title="Daraja keys saved"
              >
                Consumer key, secret and passkey from the Safaricom developer portal.
              </Step>
              <Step done={mpesa?.status === "ok"} title="Connection tested">
                {mpesa?.status === "ok"
                  ? `Live on ${String(mpesa.config.environment)} short code ${String(mpesa.config.shortcode)}.`
                  : "Press Test connection once the keys are saved."}
              </Step>
              <Step done={Boolean(mpesa?.config.c2bRegisteredAt)} title="Paybill URLs registered" optional>
                {mpesa?.config.c2bRegisteredAt
                  ? `Registered ${new Date(String(mpesa.config.c2bRegisteredAt)).toLocaleDateString()}.`
                  : "Needed for Paybill payments typed on the phone. STK Push works without it."}
              </Step>
            </ol>
          </Panel>
          {card(companyData, "mpesa", setCompanyData)}
        </div>
      )}

      {companyData && tab === "billing" && (
        <div className="settings-grid">
          {card(companyData, "reminders", setCompanyData)}
          {card(companyData, "pricing", setCompanyData)}
        </div>
      )}

      {platformData && tab === "messaging" && (
        <div className="settings-grid">
          {card(platformData, "sms", setPlatformData)}
          {card(platformData, "email", setPlatformData)}
          {card(platformData, "ussd", setPlatformData, <UssdTester />)}
        </div>
      )}

      {platformData && tab === "translation" && (
        <div className="settings-grid">{card(platformData, "ai", setPlatformData)}</div>
      )}

      {platformData && tab === "system" && (
        <div className="settings-grid">{card(platformData, "app", setPlatformData)}</div>
      )}

      {companyData && tab === "activity" && <Outbox scope={platform ? "platform" : company} />}
    </>
  );
}

function Step({
  done,
  title,
  optional,
  children,
}: {
  done: boolean;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={done ? "done" : ""}>
      {done ? (
        <CircleCheck size={18} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <CircleDashed size={18} strokeWidth={2.2} aria-hidden="true" />
      )}
      <div>
        <b>
          {title}
          {optional && <span className="hint"> · optional</span>}
        </b>
        <div className="hint">{children}</div>
      </div>
    </li>
  );
}

interface OutboxRow {
  id: number;
  to: string;
  body: string;
  purpose: string;
  status: string;
  error: string | null;
  createdAt: string;
}

function Outbox({ scope }: { scope: string }) {
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  useEffect(() => {
    void fetch(`/api/settings/${scope}/outbox`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setRows(b.messages ?? []));
  }, [scope]);

  return (
    <Panel title="SMS outbox" icon={Inbox}>
      <p className="hint" style={{ marginTop: -6 }}>
        Every message the platform sends. “Simulated” means SMS isn’t connected yet, so it was recorded but not
        delivered.
      </p>
      {rows === null ? (
        <Empty icon={RefreshCw}>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty icon={Inbox}>No messages yet.</Empty>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>To</th>
                <th>Message</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num hint">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="mono">{r.to}</td>
                  <td style={{ maxWidth: 420 }}>{r.body}</td>
                  <td className="hint">{r.purpose}</td>
                  <td>
                    <span
                      className={`chip ${r.status === "sent" ? "ok" : r.status === "failed" ? "bad" : "neutral"}`}
                      title={r.error ?? undefined}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
