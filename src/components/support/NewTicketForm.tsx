"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { companyById } from "@/lib/reference/companies";
import type { Client } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";

const CATEGORIES = ["Missed pickup", "Billing", "Bin request", "Schedule", "Other"];

export function NewTicketForm({ client, open }: { client: Client; open: boolean }) {
  const actions = useActions();
  const toast = useToast();
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    actions.createTicket(client.id, cat, subject, message);
    setSubject("");
    setMessage("");
    toast(`Sent to ${companyById(client.company).name}`);
  };

  return (
    <details className="panel" open={open}>
      <summary>New request</summary>
      <form className="stack" style={{ marginTop: 12 }} onSubmit={submit}>
        <label className="f">
          Topic
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="f">
          Subject
          <input
            required
            maxLength={80}
            placeholder="e.g. Truck skipped our street"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="f">
          Message
          <textarea
            required
            placeholder="Add details like gate colour or landmark"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <button className="btn primary">Send to care desk</button>
      </form>
    </details>
  );
}
