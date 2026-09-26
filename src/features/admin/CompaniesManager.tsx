"use client";

import { Building2, Check, MapPin, Plus, Save, Trash2, Truck, Users, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";
import { NAIROBI_CENTRE } from "@/lib/reference/estates";
import type { ReferenceOverview } from "@/server/reference";

type CompanyRow = ReferenceOverview["companies"][number];
type EstateRow = ReferenceOverview["estates"][number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CompanyDraft {
  id: string;
  name: string;
  paybill: string;
  care: string;
  hours: string;
  color: string;
}

interface EstateDraft {
  code: string;
  name: string;
  company: string;
  lat: string;
  lng: string;
  radius: string;
  days: number[];
}

const blankCompany: CompanyDraft = { id: "", name: "", paybill: "", care: "", hours: "Mon–Sat, 7am–6pm", color: "#0E7490" };
const blankEstate = (company = ""): EstateDraft => ({
  code: "",
  name: "",
  company,
  lat: String(NAIROBI_CENTRE.lat),
  lng: String(NAIROBI_CENTRE.lng),
  radius: "1500",
  days: [1, 4],
});

const toCompanyDraft = (c: CompanyRow): CompanyDraft => ({
  id: c.id,
  name: c.name,
  paybill: c.paybill,
  care: c.care,
  hours: c.hours,
  color: c.color,
});
const toEstateDraft = (e: EstateRow): EstateDraft => ({
  code: e.code,
  name: e.name,
  company: e.company ?? "",
  lat: String(e.lat),
  lng: String(e.lng),
  radius: String(e.radius),
  days: [...e.days],
});

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Onboarding: the licensed companies on the platform and the estates each
 * collects in. A company's code and an estate's code sit inside every client
 * number, so both are fixed once created.
 */
export function CompaniesManager({ data }: { data: ReferenceOverview }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | "new" | null>(data.companies[0]?.id ?? null);
  const [company, setCompany] = useState<CompanyDraft>(data.companies[0] ? toCompanyDraft(data.companies[0]) : blankCompany);
  const [estate, setEstate] = useState<{ editing: string | "new"; draft: EstateDraft } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = data.companies.find((c) => c.id === selected);
  const estatesOf = (id: string) => data.estates.filter((e) => e.company === id);
  const unassigned = data.estates.filter((e) => !e.company || !data.companies.some((c) => c.id === e.company));

  const call = async (url: string, method: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "Couldn't save.");
        return false;
      }
      toast(done);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const pick = (c: CompanyRow) => {
    setSelected(c.id);
    setCompany(toCompanyDraft(c));
    setEstate(null);
  };

  const companyDirty =
    selected === "new" ||
    (current &&
      (["name", "paybill", "care", "hours", "color"] as const).some((k) => company[k] !== current[k]));

  const saveCompany = async () => {
    if (selected === "new") {
      const ok = await call("/api/admin/companies", "POST", company, `${company.name} onboarded`);
      if (ok) setSelected(company.id.toUpperCase());
    } else if (current) {
      const { id: _id, ...rest } = company;
      await call(`/api/admin/companies/${current.id}`, "PATCH", rest, `${company.name} saved`);
    }
  };

  const removeCompany = async () => {
    if (!current || !window.confirm(`Remove ${current.name} from the platform?`)) return;
    const ok = await call(`/api/admin/companies/${current.id}`, "DELETE", undefined, `${current.name} removed`);
    if (ok) setSelected(null);
  };

  const saveEstate = async () => {
    if (!estate) return;
    const d = estate.draft;
    const body = {
      name: d.name,
      company: d.company || null,
      lat: Number(d.lat),
      lng: Number(d.lng),
      radius: Math.round(Number(d.radius)),
      days: d.days,
    };
    const ok =
      estate.editing === "new"
        ? await call("/api/admin/estates", "POST", { ...body, code: d.code }, `${d.name} added`)
        : await call(`/api/admin/estates/${estate.editing}`, "PATCH", body, `${d.name} saved`);
    if (ok) setEstate(null);
  };

  const removeEstate = async (e: EstateRow) => {
    if (!window.confirm(`Remove ${e.name}?`)) return;
    const ok = await call(`/api/admin/estates/${e.code}`, "DELETE", undefined, `${e.name} removed`);
    if (ok) setEstate(null);
  };

  const setC = (k: keyof CompanyDraft, v: string) => setCompany((c) => ({ ...c, [k]: v }));
  const setE = (patch: Partial<EstateDraft>) => setEstate((s) => (s ? { ...s, draft: { ...s.draft, ...patch } } : s));

  const estateList = (rows: EstateRow[], empty: string) =>
    rows.length ? (
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Estate</th>
              <th>Collection days</th>
              <th>Service area</th>
              <th>Clients</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.code}>
                <td>
                  {e.name} <span className="hint mono">{e.code}</span>
                </td>
                <td>{e.days.map((d) => WEEKDAYS[d]).join(", ")}</td>
                <td className="num">{(e.radius / 1000).toFixed(1)} km</td>
                <td className="num">{e.clients}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn small ghost" onClick={() => setEstate({ editing: e.code, draft: toEstateDraft(e) })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn small ghost"
                      aria-label={`Remove ${e.name}`}
                      disabled={busy || e.clients > 0}
                      title={e.clients ? "It has clients" : undefined}
                      onClick={() => removeEstate(e)}
                    >
                      <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="hint">{empty}</p>
    );

  const estateForm = estate && (
    <Panel title={estate.editing === "new" ? "New estate" : `Edit ${estate.draft.name}`} icon={MapPin}>
      <div className="co-fields">
        <label className="f">
          Code
          <input
            className="mono"
            maxLength={3}
            value={estate.draft.code}
            disabled={estate.editing !== "new"}
            onChange={(e) => setE({ code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            placeholder="KIL"
          />
        </label>
        <label className="f">
          Name
          <input maxLength={60} value={estate.draft.name} onChange={(e) => setE({ name: e.target.value })} placeholder="Kilimani" />
        </label>
        <label className="f">
          Collected by
          <select value={estate.draft.company} onChange={(e) => setE({ company: e.target.value })}>
            <option value="">No company yet</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Latitude
          <input inputMode="decimal" value={estate.draft.lat} onChange={(e) => setE({ lat: e.target.value })} />
        </label>
        <label className="f">
          Longitude
          <input inputMode="decimal" value={estate.draft.lng} onChange={(e) => setE({ lng: e.target.value })} />
        </label>
        <label className="f">
          Radius <span className="hint">(metres)</span>
          <input inputMode="numeric" value={estate.draft.radius} onChange={(e) => setE({ radius: e.target.value })} />
        </label>
      </div>
      <fieldset className="co-days">
        <legend>Collection days</legend>
        {WEEKDAYS.map((d, i) => (
          <label key={d} className="co-day">
            <input
              type="checkbox"
              checked={estate.draft.days.includes(i)}
              onChange={() =>
                setE({ days: estate.draft.days.includes(i) ? estate.draft.days.filter((x) => x !== i) : [...estate.draft.days, i].sort() })
              }
            />
            {d}
          </label>
        ))}
      </fieldset>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" className="btn small ghost" onClick={() => setEstate(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary small"
          onClick={saveEstate}
          disabled={busy || !estate.draft.name.trim() || estate.draft.code.length !== 3 || !estate.draft.days.length}
        >
          <Save size={14} strokeWidth={2.2} aria-hidden="true" />
          {busy ? "Saving…" : estate.editing === "new" ? "Add estate" : "Save estate"}
        </button>
      </div>
    </Panel>
  );

  return (
    <>
      <PageHead
        title="Companies & estates"
        icon={Building2}
        actions={
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setSelected("new");
              setCompany(blankCompany);
              setEstate(null);
            }}
          >
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Onboard company
          </button>
        }
      >
        The licensed companies on the platform and where each collects. Onboard a company here, then invite its admin from Users.
      </PageHead>

      <div className="access">
        <Panel title="Companies" icon={Building2}>
          <div className="rolelist">
            {data.companies.map((c) => (
              <button key={c.id} type="button" className="rolerow" aria-current={selected === c.id} onClick={() => pick(c)}>
                <div className="row between" style={{ gap: 8 }}>
                  <b className="with-ico">
                    <span className="co-swatch" style={{ background: c.color }} aria-hidden="true" />
                    {c.name}
                  </b>
                  <span className="hint mono">{c.id}</span>
                </div>
                <div className="hint">
                  {plural(estatesOf(c.id).length, "estate")} · {plural(c.clients, "client")}
                </div>
              </button>
            ))}
            {selected === "new" && (
              <div className="rolerow" aria-current="true">
                <b>{company.name || "New company"}</b>
                <div className="hint">Not saved yet</div>
              </div>
            )}
            {!data.companies.length && selected !== "new" && <p className="hint">No companies yet. Onboard the first one.</p>}
          </div>
        </Panel>

        {selected ? (
          <div className="stack" style={{ gap: 20 }}>
            <Panel title={selected === "new" ? "Onboard a company" : current?.name} icon={Building2}>
              <div className="co-fields">
                <label className="f">
                  Code
                  <input
                    className="mono"
                    maxLength={2}
                    value={company.id}
                    disabled={selected !== "new"}
                    onChange={(e) => setC("id", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    placeholder="2 letters, e.g. TS"
                  />
                </label>
                <label className="f">
                  Name
                  <input maxLength={80} value={company.name} onChange={(e) => setC("name", e.target.value)} placeholder="Taka Safi Services" />
                </label>
                <label className="f">
                  M-Pesa Paybill
                  <input inputMode="numeric" maxLength={7} value={company.paybill} onChange={(e) => setC("paybill", e.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="f">
                  Care line
                  <input maxLength={40} value={company.care} onChange={(e) => setC("care", e.target.value)} placeholder="0709 400 221" />
                </label>
                <label className="f">
                  Care hours
                  <input maxLength={60} value={company.hours} onChange={(e) => setC("hours", e.target.value)} />
                </label>
                <label className="f">
                  Colour
                  <input type="color" value={company.color} onChange={(e) => setC("color", e.target.value)} />
                </label>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                The code starts every client number ({company.id || "TS"}-KIL-01427) and can&rsquo;t change later. New companies get Customer care, Finance,
                Operations and Fleet departments to start with.
              </p>
              <div className="row between" style={{ marginTop: 14 }}>
                {current ? (
                  <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <Chip tone="neutral" icon={UsersRound}>
                      {plural(current.clients, "client")}
                    </Chip>
                    <Chip tone="neutral" icon={Truck}>
                      {plural(current.trucks, "truck")}
                    </Chip>
                    <Chip tone="neutral" icon={Users}>
                      {plural(current.staff, "staff account")}
                    </Chip>
                  </span>
                ) : (
                  <span />
                )}
                <div className="row" style={{ gap: 8 }}>
                  {current && (
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={removeCompany}
                      disabled={busy || current.clients + current.trucks + current.staff > 0}
                      title={current.clients + current.trucks + current.staff ? "Only a company with no clients, trucks or staff can be removed" : undefined}
                    >
                      <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn primary small"
                    onClick={saveCompany}
                    disabled={busy || !companyDirty || !company.name.trim() || company.id.length !== 2}
                  >
                    {companyDirty ? <Save size={14} strokeWidth={2.2} aria-hidden="true" /> : <Check size={14} strokeWidth={2.2} aria-hidden="true" />}
                    {busy ? "Saving…" : companyDirty ? (current ? "Save changes" : "Onboard company") : "Saved"}
                  </button>
                </div>
              </div>
            </Panel>

            {current && (
              <Panel
                title="Estates"
                icon={MapPin}
                aside={
                  <button type="button" className="btn small" onClick={() => setEstate({ editing: "new", draft: blankEstate(current.id) })}>
                    <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
                    Add estate
                  </button>
                }
              >
                {estateList(estatesOf(current.id), `${current.name} doesn't collect anywhere yet. Add an estate, or assign one below.`)}
              </Panel>
            )}

            {estateForm}

            <Panel title="Estates without a company" icon={MapPin}>
              {estateList(unassigned, "Every estate has a company.")}
            </Panel>
          </div>
        ) : (
          <div className="stack" style={{ gap: 20 }}>
            <Panel>
              <Empty icon={Building2}>Onboard a licensed company to start taking its clients.</Empty>
            </Panel>
            {estateForm}
          </div>
        )}
      </div>
    </>
  );
}
