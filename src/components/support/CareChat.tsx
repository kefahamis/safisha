"use client";

import { ArrowUp, Lock, MessageCircleDashed, RefreshCw, Sparkles, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { StatusChip } from "@/components/ui/Chip";
import { TICKET_ICONS } from "@/components/ui/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { fmtDate } from "@/lib/format";
import { nowIn } from "@/lib/selectors";
import { companyById } from "@/lib/reference/companies";
import type { Client, Ticket, TicketStatus } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";
import { DraftTranslate, MessageTranslate } from "./Translate";
import { useT } from "@/lib/i18n";
import { useTypewriter } from "./useTypewriter";

export const TOPICS = ["Missed pickup", "Billing", "Bin request", "Schedule", "Other"];

const STATUSES: TicketStatus[] = ["Open", "Pending", "Resolved"];

/** Example requests the client composer types out, each tagged with its topic. */
const EXAMPLES: { topic: string; text: string }[] = [
  {
    topic: "Missed pickup",
    text: "The truck skipped our street this morning. Can someone come back today?",
  },
  { topic: "Billing", text: "I paid September twice by Paybill. Can the extra go to October?" },
  { topic: "Bin request", text: "We need a second bin for the house. How much does one cost?" },
  { topic: "Schedule", text: "Can our collection day move from Thursday to Friday?" },
];
const EXAMPLE_TEXTS = EXAMPLES.map((e) => e.text);

/** The same examples in Kiswahili, in the same order so topics line up. */
const EXAMPLE_TEXTS_SW = [
  "Gari la taka halikupita mtaa wetu leo asubuhi. Mnaweza kurudi leo?",
  "Nililipa Septemba mara mbili kwa Paybill. Ziada inaweza kwenda Oktoba?",
  "Tunahitaji pipa la pili la nyumbani. Linagharimu pesa ngapi?",
  "Siku yetu ya kuzoa taka inaweza kuhamishwa kutoka Alhamisi hadi Ijumaa?",
];

/** Replies the agent composer suggests, by ticket topic. */
const SUGGESTIONS: Record<string, string[]> = {
  "Missed pickup": [
    "sorry about that. I've asked the driver to come back to your gate before 2pm today.",
    "apologies for the missed pickup. Your street is now flagged on today's route.",
  ],
  Billing: [
    "thanks, I can see both payments. The extra will carry forward as credit to next month.",
    "I've checked your statement. The payment is posted and your balance is up to date.",
  ],
  "Bin request": [
    "an extra bin is KES 1,500 and we can drop it on your next collection day. Shall I add it?",
  ],
  Schedule: [
    "we can move you to Friday collection from next week. I'll confirm once the route is updated.",
  ],
  Other: ["thanks for reaching out. Could you share a few more details so we can help?"],
};

/** The first sentence, kept short enough to read as a ticket subject. */
function subjectFrom(message: string) {
  const first = message
    .trim()
    .split(/(?<=[.?!])\s|\n/)[0]
    .replace(/[.?!]+$/, "");
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

function greetingFor(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/**
 * A care conversation as one chat card, for either side of the desk.
 *
 * As the client with no ticket, it is a composer for a new request that types
 * out example requests. Otherwise it is the conversation; the agent's composer
 * types out a suggested reply for the ticket's topic. Either way, clicking the
 * typed text (or pressing send) hands it over as an editable draft — nothing is
 * sent that the person didn't send themselves.
 */
export function CareChat({
  me,
  client,
  ticket,
  onNew,
  onCreated,
}: {
  me: "client" | "agent";
  /** The client on the ticket (or composing one). */
  client: Client;
  /** Omit, as the client, to compose a new request. */
  ticket?: Ticket;
  onNew?: () => void;
  /** Called once a new request has become a ticket (and the store's selection). */
  onCreated?: () => void;
}) {
  const s = useAppState();
  const actions = useActions();
  const toast = useToast();
  const { can } = useSession();
  const { t, lang } = useT();
  const canTranslate = can("tickets.translate");
  // Agents read in English; clients in the language they chose for the app.
  const readerLang = me === "agent" ? "en" : lang;
  const company = companyById(client.company);
  const first = client.name.split(" ")[0];

  const composing = me === "client" && !ticket;
  const mayWrite = composing || can("tickets.reply");
  const mayChangeStatus = me === "agent" && can("tickets.status");

  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const [inView, setInView] = useState(false);
  const [userActive, setUserActive] = useState(false);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [spins, setSpins] = useState(0);

  // Only type while the card is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "-10% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // What the composer types: example requests, or replies suited to this ticket.
  const phrases =
    me === "client"
      ? lang === "sw"
        ? EXAMPLE_TEXTS_SW
        : EXAMPLE_TEXTS
      : (SUGGESTIONS[ticket?.cat ?? ""] ?? SUGGESTIONS.Other).map((x) => `Hi ${first}, ${x}`);

  // Agents get no suggestions once a ticket is resolved.
  const suggesting = composing || (me === "agent" && ticket?.status !== "Resolved");
  const auto = mayWrite && suggesting && !userActive;
  const {
    text: typed,
    phase,
    index,
  } = useTypewriter(phrases, {
    enabled: auto && inView,
  });
  const phrase = phrases[index % phrases.length];
  const example = EXAMPLES[index % EXAMPLES.length];

  // Each conversation starts with a clean composer.
  useEffect(() => {
    setDraft("");
    setUserActive(false);
  }, [ticket?.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket?.id, ticket?.msgs.length]);

  /** Hand the composer to the person with the whole phrase, never a half-typed one. */
  const takeOver = (text = phrase) => {
    setDraft(text);
    if (composing) setTopic(example.topic);
    setUserActive(true);
    requestAnimationFrame(() => {
      const el = fieldRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const [sending, setSending] = useState(false);

  const send = async () => {
    // Sending mid-animation opens the typed text as the person's own draft.
    if (auto) return takeOver();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const result = composing
      ? await actions.createTicket(client.id, topic, subjectFrom(body), body)
      : ticket
        ? await actions.reply(ticket.id, me, body)
        : null;
    setSending(false);
    if (result && !result.ok) {
      toast(result.error);
      return;
    }
    if (composing) {
      toast(`Sent to ${company.name}`);
      onCreated?.();
    }
    setDraft("");
    setUserActive(false);
  };

  const reset = () => {
    setSpins((n) => n + 1);
    setDraft("");
    setUserActive(false);
    onNew?.();
  };

  const hour = nowIn(s).getHours();
  const shownTopic = auto ? example.topic : topic;
  const canSend = auto ? !!typed : !!draft.trim();
  const StatusIcon = ticket ? TICKET_ICONS[ticket.status] : undefined;
  const placeholder = composing
    ? t("Describe the problem…")
    : me === "agent"
      ? `Reply to ${first}…`
      : t("Write a message…");

  return (
    <div className="chatcard" ref={rootRef}>
      <div className="chatcard-head">
        <div style={{ minWidth: 0 }}>
          <h3>{ticket ? ticket.subject : t("New request")}</h3>
          <div className="chatcard-sub">
            {!ticket ? (
              `${company.name} care · ${company.hours}`
            ) : (
              <>
                {!mayChangeStatus && <StatusChip status={ticket.status} />}
                <span>
                  {ticket.id} · {ticket.cat}
                  {me === "agent" && (
                    <>
                      {" · "}
                      {client.name} (<span className="mono">{client.id}</span>)
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        {me === "client" ? (
          <button
            type="button"
            className="chat-round"
            onClick={reset}
            aria-label={t("Start a new request")}
            title={t("New request")}
          >
            <RefreshCw
              size={16}
              strokeWidth={2.2}
              aria-hidden="true"
              className="chat-spin"
              style={{ transform: `rotate(${spins * 360}deg)` }}
            />
          </button>
        ) : (
          ticket &&
          StatusIcon &&
          mayChangeStatus && (
            <label className={`chat-pill status-${ticket.status.toLowerCase()}`}>
              <StatusIcon size={13} strokeWidth={2.4} aria-hidden="true" />
              <select
                aria-label="Ticket status"
                value={ticket.status}
                onChange={(e) => actions.setTicketStatus(ticket.id, e.target.value as TicketStatus)}
              >
                {STATUSES.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
            </label>
          )
        )}
      </div>

      {composing ? (
        <div className="chatcard-empty">
          <span className="chat-float" aria-hidden="true">
            <MessageCircleDashed size={20} strokeWidth={2} />
          </span>
          <p className="chat-greet">
            {t(greetingFor(hour))}, {first}!
          </p>
          <p className="chat-prompt">
            {t("What can we help with? Press send and {company} will reply right here.", {
              company: company.name,
            })}
          </p>
        </div>
      ) : (
        ticket && (
          <div className="chat-thread" ref={threadRef}>
            {ticket.msgs.map((m, i) =>
              m.from === "sys" ? (
                <div className="chat-sys" key={i}>
                  {m.text}
                </div>
              ) : (
                <div className={`chat-row ${m.from === me ? "me" : "them"}`} key={i}>
                  <div className={`chat-msg ${m.from === me ? "me" : "them"}`}>
                    {m.text}
                    {m.photo && (
                      <a
                        href={`/api/files/${m.photo}`}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/${m.photo}`}
                          alt="Photo from the crew"
                          loading="lazy"
                        />
                      </a>
                    )}
                    <div className="meta">
                      {m.from === me
                        ? t("You")
                        : m.from === "agent"
                          ? `${company.name} care`
                          : client.name}{" "}
                      · {fmtDate(m.at)}
                    </div>
                  </div>
                  {m.from !== me && canTranslate && (
                    <MessageTranslate
                      messageId={m.id}
                      text={m.text}
                      target={readerLang}
                      aiReady={s.integrations.translate}
                    />
                  )}
                </div>
              ),
            )}
          </div>
        )
      )}

      <div className="chat-composer-wrap">
        {mayWrite ? (
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {auto ? (
              <div
                className="chat-field chat-typed"
                role="textbox"
                tabIndex={0}
                aria-label="Message"
                onClick={() => takeOver()}
                onFocus={() => takeOver()}
              >
                {typed}
                <span className="chat-caret" aria-hidden="true" />
                {!typed && <span className="chat-placeholder">{placeholder}</span>}
              </div>
            ) : (
              <textarea
                ref={fieldRef}
                className="chat-field"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={placeholder}
                aria-label="Message"
                maxLength={600}
              />
            )}

            <div className="chat-actions">
              {composing ? (
                <label className="chat-pill">
                  <Tag size={13} strokeWidth={2.2} aria-hidden="true" />
                  <select
                    aria-label={t("Topic")}
                    value={shownTopic}
                    onChange={(e) => {
                      if (auto) takeOver();
                      setTopic(e.target.value);
                    }}
                  >
                    {TOPICS.map((x) => (
                      <option key={x} value={x}>
                        {t(x)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : auto ? (
                <span className="chat-hint with-ico">
                  <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />
                  Suggested reply · click to edit
                </span>
              ) : me === "agent" && canTranslate && s.integrations.translate ? (
                <DraftTranslate draft={draft} onTranslated={setDraft} />
              ) : (
                <span className="chat-hint">{t("Enter to send · Shift+Enter for a new line")}</span>
              )}
              <button
                type="submit"
                className={`chat-send${auto && phase === "holding" ? " nudge" : ""}`}
                aria-label={composing ? "Send request" : "Send message"}
                disabled={!canSend || sending}
              >
                <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : (
          <p className="hint with-ico" style={{ margin: 0 }}>
            <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
            {t("You can read this conversation but not reply.")}
          </p>
        )}
      </div>
    </div>
  );
}
