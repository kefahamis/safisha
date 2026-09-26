"use client";

import { Check, ChevronDown, CircleAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { estateName } from "@/lib/reference/estates";
import type { ClientType, Company } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";

/** Registering a client issues its number and raises the first monthly charge. */
export function AddClientForm({ company }: { company: Company }) {
  const actions = useActions();
  const toast = useToast();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [estate, setEstate] = useState(company.estates[0] ?? "");
  const [type, setType] = useState<ClientType>("Household");
  const [plan, setPlan] = useState(600);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await actions.addClient(company.id, { name, phone, estate, type, plan });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setName("");
    setPhone("");
    toast(`Created ${result.id} for ${result.name}. Welcome SMS with Paybill details sent.`);
  };

  return (
    <details className="panel">
      <summary>
        <span className="summary-ico" aria-hidden="true">
          <UserPlus size={17} strokeWidth={2.2} aria-hidden="true" />
        </span>
        Register a new client
        <ChevronDown size={17} strokeWidth={2.2} className="chev" aria-hidden="true" />
      </summary>
      <form className="form" style={{ marginTop: 14 }} onSubmit={submit}>
        <label className="f">
          Full name / business
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="f">
          M-Pesa phone
          <input
            required
            placeholder="07XX XXX XXX"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="f">
          Estate
          <select value={estate} onChange={(e) => setEstate(e.target.value)}>
            {company.estates.map((code) => (
              <option key={code} value={code}>
                {estateName(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as ClientType)}>
            <option>Household</option>
            <option>Business</option>
          </select>
        </label>
        <label className="f">
          Monthly fee (KES)
          <input
            type="number"
            min={100}
            step={50}
            value={plan}
            onChange={(e) => setPlan(Number(e.target.value))}
          />
        </label>
        <button className="btn primary" disabled={busy}>
          <Check size={16} strokeWidth={2.2} aria-hidden="true" />
          Create account
        </button>
      </form>
      {error && (
        <div className="err">
          <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
          {error}
        </div>
      )}
    </details>
  );
}
