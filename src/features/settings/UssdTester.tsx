"use client";

import { Phone, PhoneOff, SendHorizontal } from "lucide-react";
import { useState } from "react";

/**
 * Walks the real USSD menu without a telco: the same server code Africa's
 * Talking calls, driven from a drawn phone. Try a client's number, or any
 * other number to see the unregistered path.
 */
export function UssdTester() {
  const [phone, setPhone] = useState("0734 156 298");
  const [answers, setAnswers] = useState<string[] | null>(null);
  const [reply, setReply] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const step = async (next: string[]) => {
    setBusy(true);
    try {
      const res = await fetch("/api/ussd/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, text: next.join("*") }),
      });
      const body = await res.json();
      setReply(body.reply ?? body.error ?? "No reply");
      setAnswers(next);
      setInput("");
    } finally {
      setBusy(false);
    }
  };

  const ended = reply.startsWith("END");
  const screen = reply.replace(/^(CON|END)\s?/, "");

  return (
    <div className="ussd">
      <div className="label">Try the menu</div>
      <div className="row" style={{ gap: 8 }}>
        <label className="field" style={{ flex: 1 }}>
          <Phone size={15} strokeWidth={2.2} aria-hidden="true" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone number" />
        </label>
        <button type="button" className="btn small primary" onClick={() => step([])} disabled={busy}>
          <Phone size={14} strokeWidth={2.2} aria-hidden="true" />
          Dial
        </button>
      </div>

      {answers && (
        <div className="phone ussd-phone">
          <div className="scr">
            <div className="box" style={{ whiteSpace: "pre-line" }}>
              {screen}
            </div>
            {ended ? (
              <button type="button" className="btn small" onClick={() => setAnswers(null)}>
                <PhoneOff size={14} strokeWidth={2.2} aria-hidden="true" />
                Close
              </button>
            ) : (
              <form
                className="row"
                style={{ gap: 6, flexWrap: "nowrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (input.trim()) void step([...answers, input.trim()]);
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Reply"
                  autoFocus
                  style={{ minWidth: 0, flex: 1, padding: "6px 10px" }}
                />
                <button className="btn small primary icon-only" aria-label="Send" disabled={busy}>
                  <SendHorizontal size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
