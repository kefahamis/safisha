"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { AUDIT_CATEGORIES, type RetentionPreview } from "@/lib/auditRetention";

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? "" : "s"}`;

/** Under the retention settings: what each limit would remove today, and a way to do it now. */
export function AuditPurge() {
  const toast = useToast();
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/audit/retention", { cache: "no-store" });
    if (res.ok) setPreview(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!preview) return null;
  const due = preview.categories.reduce((n, c) => n + c.due, 0);

  const purge = async () => {
    if (!window.confirm(`Remove ${plural(due, "audit entry")} past their limits? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/audit/retention", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      const removed = Object.values(body.removed ?? {}).reduce((n: number, x) => n + Number(x), 0);
      setPreview(body.preview);
      toast(`Removed ${plural(removed, "entry")}.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="list">
        {preview.categories.map((c) => (
          <div className="li" key={c.key}>
            <div>
              <div className="t">{AUDIT_CATEGORIES.find((x) => x.key === c.key)?.label}</div>
              <div className="sub">
                {plural(c.total, "entry")} · kept {plural(c.days, "day")}
              </div>
            </div>
            <span className={c.due ? "chip warn" : "chip neutral"}>{c.due ? `${c.due.toLocaleString()} past limit` : "None due"}</span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {preview.policy.enabled
          ? "Entries past their limit are removed each night. Removed entries remain in database backups until those expire."
          : "Automatic removal is off, so nothing is deleted until you turn it on or clean up by hand."}
      </p>
      <button type="button" className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={purge} disabled={busy || due === 0}>
        {busy ? (
          <LoaderCircle size={14} strokeWidth={2.2} className="spin" aria-hidden="true" />
        ) : (
          <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
        )}
        Clean up now
      </button>
    </div>
  );
}
