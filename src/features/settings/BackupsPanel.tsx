"use client";

import { DatabaseBackup, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/ToastProvider";

interface Backup {
  name: string;
  size: number;
  takenAt: string;
}

interface State {
  ready: { key: boolean; blob: boolean };
  backups: Backup[];
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The nightly database backups: whether they're running, the recent ones, and a way to take one now. */
export function BackupsPanel() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/backups", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setState(body as State);
    else setError(body.error ?? "Couldn't load backups.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/backups", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    toast(res.ok ? `Backed up ${body.rows} rows from ${body.tables} tables.` : (body.error ?? "The backup failed."));
    if (res.ok) void load();
  };

  const ready = state?.ready.key && state.ready.blob;

  return (
    <Panel
      title="Backups"
      icon={DatabaseBackup}
      aside={
        ready ? (
          <button type="button" className="btn small" onClick={runNow} disabled={busy}>
            <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
            {busy ? "Backing up…" : "Back up now"}
          </button>
        ) : undefined
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Every night the whole database is exported, encrypted and kept for 14 days, apart from the point-in-time history your database host keeps.
        To restore one, download it and run <span className="mono">scripts/restore.mjs</span> with the encryption key.
      </p>
      {error && <div className="banner">{error}</div>}
      {state && !ready && (
        <div className="banner">
          Backups are off.{" "}
          {!state.ready.key && (
            <>
              Set <span className="mono">BACKUP_ENCRYPTION_KEY</span> (64 hex characters, kept somewhere safe outside this deployment).{" "}
            </>
          )}
          {!state.ready.blob && <>They&rsquo;re kept in Netlify Blobs, which this server can&rsquo;t reach (it can once deployed on Netlify).</>}
        </div>
      )}
      {state && ready && (
        state.backups.length ? (
          <div className="list">
            {state.backups.map((b) => (
              <div className="li" key={b.name}>
                <div>
                  <div className="t">{b.takenAt ? when(b.takenAt) : b.name}</div>
                  <div className="sub">{mb(b.size)} · encrypted</div>
                </div>
                <a className="btn small ghost" href={`/api/admin/backups/download?name=${encodeURIComponent(b.name)}`}>
                  <Download size={14} strokeWidth={2.2} aria-hidden="true" />
                  Download
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">
            <Chip tone="neutral">None yet</Chip> The first runs tonight, or take one now.
          </p>
        )
      )}
    </Panel>
  );
}
