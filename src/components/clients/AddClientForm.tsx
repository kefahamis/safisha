"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/ToastProvider";
import {
  BUSINESS_DOCUMENT_KINDS,
  CLIENT_DOCUMENT_KINDS,
  isBusinessKind,
  MAX_CLIENT_DOCUMENTS,
  missingBusinessKinds,
  type ClientDocumentKind,
} from "@/lib/clientDocuments";
import { KE_MOBILE } from "@/lib/clientNumber";
import { kes } from "@/lib/format";
import { estateName } from "@/lib/reference/estates";
import type { ClientType, Company } from "@/lib/types";
import { uploadDocument } from "@/store/actions";
import { useActions } from "@/store/StoreProvider";

const STEPS = ["Client", "Service", "Documents", "Review"] as const;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
/** A business's own papers each get a row; anything else is picked from the rest. */
const OTHER_KINDS = CLIENT_DOCUMENT_KINDS.filter((k) => !isBusinessKind(k));

interface PendingDoc {
  key: number;
  kind: ClientDocumentKind;
  name: string;
  isPdf: boolean;
  size: number;
  status: "uploading" | "done" | "failed";
  file?: string;
  error?: string;
}

/** Opens the registration drawer. */
export function AddClientForm({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        <UserPlus size={16} strokeWidth={2.2} aria-hidden="true" />
        Register a new client
      </button>
      {open ? <AddClientDrawer company={company} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Registering a client issues its number and raises the first monthly charge. */
function AddClientDrawer({ company, onClose }: { company: Company; onClose: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const body = useRef<HTMLFormElement>(null);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<ClientType>("Household");
  const [estate, setEstate] = useState(company.estates[0] ?? "");
  const [plan, setPlan] = useState(600);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [otherKind, setOtherKind] = useState<ClientDocumentKind>(OTHER_KINDS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(1);

  // Each step starts at its first field.
  useEffect(() => {
    body.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, [step]);

  const uploading = docs.some((d) => d.status === "uploading");

  /** What stops the given step from going on, if anything. */
  const problem = (at: number): string => {
    if (at === 0) {
      if (!name.trim()) return "Enter the client's name.";
      if (!KE_MOBILE.test(phone.replace(/\s/g, ""))) return "Enter a Kenyan mobile number like 0712 345 678.";
    }
    if (at === 1) {
      if (!estate) return "Pick one of your service estates.";
      if (!(plan >= 100)) return "The monthly fee is at least KES 100.";
    }
    if (at === 2) {
      if (uploading) return "Wait for the uploads to finish.";
      if (docs.some((d) => d.status === "failed")) return "Remove or retry the documents that failed.";
      if (type === "Business") {
        const missing = missingBusinessKinds(docs.filter((d) => d.status === "done").map((d) => d.kind));
        if (missing.length) return `A business needs its ${listOf(missing)}.`;
      }
    }
    return "";
  };

  const goTo = (target: number) => {
    // Forward only past steps that are complete; back is always allowed.
    for (let i = step; i < target; i++) {
      const p = problem(i);
      if (p) {
        setStep(i);
        setError(p);
        return;
      }
    }
    setError("");
    setStep(target);
  };

  const removeDoc = (key: number) => setDocs((all) => all.filter((x) => x.key !== key));

  const addFiles = (files: FileList | null, kind: ClientDocumentKind) => {
    if (!files?.length) return;
    const room = MAX_CLIENT_DOCUMENTS - docs.length;
    if (room <= 0) {
      setError(`Attach at most ${MAX_CLIENT_DOCUMENTS} documents.`);
      return;
    }
    setError("");
    for (const file of Array.from(files).slice(0, room)) {
      const key = nextKey.current++;
      const isPdf = file.type === "application/pdf";
      const entry: PendingDoc = { key, kind, name: file.name, isPdf, size: file.size, status: "uploading" };
      if (!isPdf && !file.type.startsWith("image/")) {
        setDocs((d) => [...d, { ...entry, status: "failed", error: "Only PDFs and photos." }]);
        continue;
      }
      if (isPdf && file.size > 5 * 1024 * 1024) {
        setDocs((d) => [...d, { ...entry, status: "failed", error: "PDFs must be under 5 MB." }]);
        continue;
      }
      setDocs((d) => [...d, entry]);
      uploadDocument(file).then(
        (id) => setDocs((d) => d.map((x) => (x.key === key ? { ...x, status: "done", file: id } : x))),
        (err: Error) => setDocs((d) => d.map((x) => (x.key === key ? { ...x, status: "failed", error: err.message } : x))),
      );
    }
  };

  const submit = async () => {
    for (let i = 0; i < 3; i++) {
      const p = problem(i);
      if (p) {
        setStep(i);
        setError(p);
        return;
      }
    }
    setBusy(true);
    const result = await actions.addClient(company.id, {
      name,
      phone,
      estate,
      type,
      plan,
      documents: docs.map((d) => ({ file: d.file!, kind: d.kind, name: d.name })),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast(`Created ${result.id} for ${result.name}. Welcome SMS with Paybill details sent.`);
    onClose();
  };

  const last = step === STEPS.length - 1;

  return (
    <Drawer
      title="Register a new client"
      subtitle="Issues a client number and raises the first monthly charge."
      onClose={onClose}
      footer={
        <>
          {error ? (
            <div className="err" role="alert">
              <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          <div className="row between">
            {step > 0 ? (
              <button type="button" className="btn" onClick={() => goTo(step - 1)} disabled={busy}>
                <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                Back
              </button>
            ) : (
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
            )}
            {last ? (
              <button type="button" className="btn primary" onClick={submit} disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-hidden="true" />
                ) : (
                  <Check size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                Create account
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => goTo(step + 1)}>
                {step === 2 && docs.length === 0 && type !== "Business" ? "Skip" : "Next"}
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      }
    >
      <ol className="stepper" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "on" : i < step ? "done" : undefined}>
            <button type="button" onClick={() => goTo(i)} aria-current={i === step ? "step" : undefined} disabled={busy}>
              <span className="stepper-n">
                {i < step ? <Check size={13} strokeWidth={2.6} aria-hidden="true" /> : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <form
        className="drawer-form"
        ref={body}
        onSubmit={(e) => {
          e.preventDefault();
          if (last) submit();
          else goTo(step + 1);
        }}
      >
        {step === 0 && (
          <>
            <label className="f">
              Full name / business
              <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="f">
              Type
              <select value={type} onChange={(e) => setType(e.target.value as ClientType)}>
                <option>Household</option>
                <option>Business</option>
              </select>
            </label>
            <label className="f">
              M-Pesa phone
              <input
                placeholder="07XX XXX XXX"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="hint">The welcome SMS and payment prompts go here.</span>
            </label>
          </>
        )}

        {step === 1 && (
          <>
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
              Monthly fee (KES)
              <input type="number" min={100} step={50} value={plan} onChange={(e) => setPlan(Number(e.target.value))} />
              <span className="hint">The first month is charged when the account is created.</span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <p className="hint">
              {type === "Business"
                ? "A business needs its KRA PIN certificate, certificate of registration and CR12; other papers are optional."
                : "Optional."}{" "}
              PDFs or photos, up to {MAX_CLIENT_DOCUMENTS} files in all. PDFs up to 5 MB.
            </p>

            {type === "Business" ? (
              <>
                {BUSINESS_DOCUMENT_KINDS.map((kind) => (
                  <DocGroup
                    key={kind}
                    title={kind}
                    required
                    docs={docs.filter((d) => d.kind === kind)}
                    full={docs.length >= MAX_CLIENT_DOCUMENTS}
                    onAdd={(files) => addFiles(files, kind)}
                    onRemove={removeDoc}
                  />
                ))}
                <DocGroup
                  title="Other documents"
                  docs={docs.filter((d) => !isBusinessKind(d.kind))}
                  full={docs.length >= MAX_CLIENT_DOCUMENTS}
                  onAdd={(files) => addFiles(files, otherKind)}
                  onRemove={removeDoc}
                  picker={
                    <select
                      aria-label="Document type"
                      value={otherKind}
                      onChange={(e) => setOtherKind(e.target.value as ClientDocumentKind)}
                    >
                      {OTHER_KINDS.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  }
                />
              </>
            ) : (
              <DocGroup
                title="Documents"
                docs={docs}
                full={docs.length >= MAX_CLIENT_DOCUMENTS}
                onAdd={(files) => addFiles(files, otherKind)}
                onRemove={removeDoc}
                picker={
                  <select
                    aria-label="Document type"
                    value={otherKind}
                    onChange={(e) => setOtherKind(e.target.value as ClientDocumentKind)}
                  >
                    {CLIENT_DOCUMENT_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                }
              />
            )}
          </>
        )}

        {step === 3 && (
          <dl className="review">
            <ReviewRow label="Name" value={`${name.trim()} · ${type}`} onEdit={() => goTo(0)} />
            <ReviewRow label="M-Pesa phone" value={phone} onEdit={() => goTo(0)} />
            <ReviewRow label="Estate" value={estateName(estate)} onEdit={() => goTo(1)} />
            <ReviewRow label="Monthly fee" value={kes(plan)} onEdit={() => goTo(1)} />
            <ReviewRow
              label="Documents"
              value={docs.length ? docSummary(docs) : "None"}
              onEdit={() => goTo(2)}
            />
          </dl>
        )}
        {/* Enter in a field moves on, as the footer button would. */}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

/**
 * One kind of document (or a mixed "other" pile): the files added so far and a
 * button to add another, so a multi-page paper can go up a page at a time.
 */
function DocGroup({
  title,
  docs,
  full,
  onAdd,
  onRemove,
  picker,
  required = false,
}: {
  title: string;
  docs: PendingDoc[];
  full: boolean;
  onAdd: (files: FileList | null) => void;
  onRemove: (key: number) => void;
  picker?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <section className="doc-group">
      <div className="doc-group-head">
        <h3>
          {title}
          {required ? (
            <span className="req" aria-label="required">
              {" "}
              *
            </span>
          ) : null}
        </h3>
        {docs.length ? (
          <span className="hint">{docs.length === 1 ? "1 file" : `${docs.length} files`}</span>
        ) : required ? (
          <span className="hint">Required</span>
        ) : null}
      </div>
      {docs.length ? (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.key} className={d.status}>
              <span className="doc-ico" aria-hidden="true">
                {d.isPdf ? <FileText size={17} strokeWidth={2} /> : <ImageIcon size={17} strokeWidth={2} />}
              </span>
              <span className="doc-text">
                <strong>{d.name}</strong>
                <span className="hint">
                  {picker ? `${d.kind} · ` : null}
                  {fileSize(d.size)}
                  {d.status === "failed" ? ` · ${d.error}` : null}
                </span>
              </span>
              {d.status === "uploading" ? (
                <LoaderCircle size={16} strokeWidth={2.2} className="spin" aria-label="Uploading" />
              ) : d.status === "done" ? (
                <Check size={16} strokeWidth={2.4} className="doc-ok" aria-label="Uploaded" />
              ) : (
                <CircleAlert size={16} strokeWidth={2.2} className="doc-bad" aria-label="Failed" />
              )}
              <button
                type="button"
                className="btn small ghost icon-only"
                aria-label={`Remove ${d.name}`}
                onClick={() => onRemove(d.key)}
              >
                <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {full ? null : (
        <div className="doc-add">
          {picker}
          <label className="btn small">
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            {docs.length ? "Add another" : "Add file"}
            <input
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                onAdd(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}

/** "KRA PIN certificate, CR12 ×2" */
function docSummary(docs: PendingDoc[]) {
  const counts = new Map<string, number>();
  for (const d of docs) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind)).join(", ");
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        <button type="button" className="btn small ghost icon-only" onClick={onEdit} aria-label={`Change ${label.toLowerCase()}`}>
          <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </dd>
    </div>
  );
}

/** "A, B and C" */
function listOf(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
