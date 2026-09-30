"use client";

import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientDocument } from "@/lib/clientDocuments";
import { fmtDate } from "@/lib/format";

/** The papers kept on file for one client; each opens in a new tab. */
export function ClientDocuments({ clientId }: { clientId: string }) {
  const [loaded, setLoaded] = useState<{ client: string; documents: ClientDocument[] } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/clients/${encodeURIComponent(clientId)}/documents`)
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .then((body) => live && setLoaded({ client: clientId, documents: body.documents ?? [] }))
      .catch(() => live && setLoaded({ client: clientId, documents: [] }));
    return () => {
      live = false;
    };
  }, [clientId]);

  // Nothing until this client's list arrives, and nothing at all when it's empty.
  const documents = loaded?.client === clientId ? loaded.documents : [];
  if (!documents.length) return null;

  return (
    <section style={{ marginBottom: 16 }}>
      <h3 className="with-ico" style={{ marginBottom: 8 }}>
        <Paperclip size={15} strokeWidth={2.2} aria-hidden="true" />
        Documents on file
      </h3>
      <ul className="doc-list">
        {documents.map((d) => (
          <li key={d.id}>
            <span className="doc-ico" aria-hidden="true">
              {d.mime === "application/pdf" ? <FileText size={17} strokeWidth={2} /> : <ImageIcon size={17} strokeWidth={2} />}
            </span>
            <a className="doc-text" href={`/api/files/${d.file}`} target="_blank" rel="noreferrer">
              <strong>{d.kind}</strong>
              <span className="hint">
                {d.name} · added {fmtDate(d.uploadedAt.slice(0, 10))}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
