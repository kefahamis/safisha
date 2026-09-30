"use client";

import { Building2, LoaderCircle, Package, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Empty, PageHead, Panel } from "@/components/ui/Panel";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/ToastProvider";
import { kes } from "@/lib/format";
import { ALWAYS_INCLUDED, PACKAGE_FEATURES, type CarePackageDef, type PackageFeature } from "@/lib/packages";

interface Draft {
  name: string;
  description: string;
  /** Shillings as typed. */
  price: string;
  features: PackageFeature[];
  active: boolean;
}

const blank: Draft = { name: "", description: "", price: "", features: [], active: true };
const toDraft = (p: CarePackageDef): Draft => ({
  name: p.name,
  description: p.description,
  price: String(p.price),
  features: p.features,
  active: p.active,
});

/** Features in the catalogue's order, so the same set always reads and saves the same way. */
const inOrder = (features: PackageFeature[]) => PACKAGE_FEATURES.map((f) => f.key).filter((k) => features.includes(k));

/** The platform's catalogue of care packages: what each includes and costs, and whether it's offered. */
export function PackagesManager() {
  const toast = useToast();
  const [packages, setPackages] = useState<CarePackageDef[] | null>(null);
  const [subscribers, setSubscribers] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/packages", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load the packages.");
    setPackages(body.packages);
    setSubscribers(body.subscribers ?? {});
    return body.packages as CarePackageDef[];
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = packages?.find((p) => p.id === selected);
  const pick = (id: string | "new") => {
    setSelected(id);
    const p = packages?.find((x) => x.id === id);
    setDraft(p ? toDraft(p) : blank);
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleFeature = (f: PackageFeature) =>
    set("features", draft.features.includes(f) ? draft.features.filter((x) => x !== f) : [...draft.features, f]);

  // Features compare as a set, whatever order they were ticked in.
  const same = (d: Draft) => JSON.stringify({ ...d, features: inOrder(d.features) });
  const dirty = selected === "new" || (current !== undefined && same(toDraft(current)) !== same(draft));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        price: draft.price.trim() === "" ? NaN : Number(draft.price),
        features: inOrder(draft.features),
        active: draft.active,
      };
      if (!Number.isFinite(body.price)) throw new Error("Enter the monthly price in shillings.");
      const res = await fetch(selected === "new" ? "/api/admin/packages" : `/api/admin/packages/${selected}`, {
        method: selected === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "That didn't work.");
      await load();
      setSelected(out.package.id);
      setDraft(toDraft(out.package));
      toast(`${out.package.name} saved.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current || !window.confirm(`Delete ${current.name}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/packages/${current.id}`, { method: "DELETE" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "That didn't work.");
      await load();
      setSelected(null);
      toast(`${current.name} deleted.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!packages) {
    return (
      <>
        <PageHead title="Care packages" icon={Package} />
        {error ? <div className="banner">{error}</div> : <Empty icon={Package}>Loading…</Empty>}
      </>
    );
  }

  const inUse = current ? (subscribers[current.id] ?? 0) : 0;

  return (
    <>
      <PageHead
        title="Care packages"
        icon={Package}
        actions={
          <button type="button" className="btn primary" onClick={() => pick("new")}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            New package
          </button>
        }
      >
        What companies can subscribe to for their customer care. Without a package a company has the in-app chat with the AI
        assistant; each package adds features for a monthly fee, owed to the platform.
      </PageHead>

      <div className="grid g-main">
        <Panel title="Packages" icon={Package}>
          {packages.length === 0 ? (
            <Empty icon={Package}>No packages yet. Create one to start offering it.</Empty>
          ) : (
            <div className="list">
              {packages.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`li pkg-row${selected === p.id ? " active" : ""}`}
                  onClick={() => pick(p.id)}
                >
                  <div>
                    <div className="t">
                      {p.name} {!p.active && <Chip tone="neutral">Not offered</Chip>}
                    </div>
                    <div className="sub">
                      {p.features.length
                        ? PACKAGE_FEATURES.filter((f) => p.features.includes(f.key))
                            .map((f) => f.label)
                            .join(" · ")
                        : "No features"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <b className="num">{kes(p.price)}</b>
                    <div className="sub with-ico" style={{ justifyContent: "flex-end" }}>
                      <Building2 size={12} strokeWidth={2.2} aria-hidden="true" />
                      {subscribers[p.id] ?? 0}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="hint">Every company, package or not: {ALWAYS_INCLUDED.join(" · ")}.</p>
        </Panel>

        {selected ? (
          <Panel title={selected === "new" ? "New package" : current?.name} icon={Package}>
            <div className="stack" style={{ gap: 14 }}>
              <label className="f">
                Name
                <input maxLength={40} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Business" />
              </label>
              <label className="f">
                Description <span className="hint">(shown to company admins)</span>
                <textarea
                  maxLength={240}
                  rows={2}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </label>
              <label className="f">
                Price <span className="hint">(KES a month)</span>
                <input
                  inputMode="numeric"
                  maxLength={7}
                  value={draft.price}
                  onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))}
                  placeholder="5000"
                />
              </label>
              <fieldset className="pkg-feature-pick">
                <legend>Includes</legend>
                {PACKAGE_FEATURES.map((f) => (
                  <label key={f.key} className="pkg-feature-option">
                    <input type="checkbox" checked={draft.features.includes(f.key)} onChange={() => toggleFeature(f.key)} />
                    <span>
                      <b>{f.label}</b>
                      <span className="hint">{f.detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="row between">
                <span>
                  <b>Offered to companies</b>
                  <div className="hint">Turn off to stop new subscriptions. Companies already on it keep it.</div>
                </span>
                <Toggle checked={draft.active} onChange={(v) => set("active", v)} label="Offered to companies" />
              </div>
              {current && (
                <p className="hint" style={{ margin: 0 }}>
                  {inUse ? `${inUse} ${inUse === 1 ? "company is" : "companies are"} on this package. ` : ""}A new price applies from
                  the next monthly charge; a company&rsquo;s own agreed price under Companies stays as it is.
                </p>
              )}
              <div className="row between">
                {current ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={remove}
                    disabled={busy || inUse > 0}
                    title={inUse ? "Companies are on this package. Stop offering it instead." : undefined}
                  >
                    <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className="btn primary" onClick={save} disabled={busy || !dirty}>
                  {busy ? (
                    <LoaderCircle size={15} strokeWidth={2.2} className="spin" aria-hidden="true" />
                  ) : (
                    <Save size={15} strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {selected === "new" ? "Create package" : "Save"}
                </button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel>
            <Empty icon={Package}>Pick a package to edit it, or create a new one.</Empty>
          </Panel>
        )}
      </div>
    </>
  );
}
