"use client";

import { BookOpenText, Languages, LoaderCircle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { lookupTerms } from "@/lib/sheng";

export type TargetLang = "en" | "sw" | "sheng";

export interface TranslationResult {
  detected: string;
  translation: string;
  glossary: { term: string; meaning: string }[];
  note: string;
  source: "ai" | "glossary";
}

const LANG_LABEL: Record<TargetLang, string> = { en: "English", sw: "Kiswahili", sheng: "Sheng" };
const DETECTED: Record<string, string> = {
  english: "English",
  kiswahili: "Kiswahili",
  sheng: "Sheng",
  mixed: "Mixed Sheng, Kiswahili and English",
  other: "Unknown",
};

/**
 * Under one chat message: slang looked up in the Sheng glossary (instant, no
 * key needed) and, on request, a full translation checked against it.
 */
export function MessageTranslate({
  messageId,
  text,
  target,
  aiReady,
}: {
  messageId?: number;
  text: string;
  target: TargetLang;
  aiReady: boolean;
}) {
  const terms = useMemo(() => lookupTerms(text), [text]);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (!messageId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, target }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Translation failed.");
      else setResult(body.translation);
    } finally {
      setBusy(false);
    }
  };

  const slang = terms.filter((x) => x.kind === "sheng");

  return (
    <div className="msg-tools">
      <div className="msg-tool-row">
        {aiReady && messageId && !result && (
          <button type="button" className="msg-tool" onClick={run} disabled={busy}>
            {busy ? (
              <LoaderCircle size={12} strokeWidth={2.4} className="spin" aria-hidden="true" />
            ) : (
              <Languages size={12} strokeWidth={2.4} aria-hidden="true" />
            )}
            {busy ? t("Translating…") : t("Translate to {lang}", { lang: LANG_LABEL[target] })}
          </button>
        )}
        {terms.length > 0 && (
          <button
            type="button"
            className={`msg-tool${slang.length ? " sheng" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <BookOpenText size={12} strokeWidth={2.4} aria-hidden="true" />
            {[
              slang.length ? `${slang.length} Sheng` : "",
              terms.length - slang.length ? `${terms.length - slang.length} Kiswahili` : "",
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            {terms.length === 1 ? "term" : "terms"}
          </button>
        )}
      </div>

      {open && terms.length > 0 && (
        <dl className="gloss">
          {terms.map((x) => (
            <div key={x.term}>
              <dt>{x.term}</dt>
              <dd>{x.meaning}</dd>
            </div>
          ))}
        </dl>
      )}

      {error && (
        <div className="msg-translation bad">
          <TriangleAlert size={12} strokeWidth={2.4} aria-hidden="true" />
          {error}
        </div>
      )}

      {result && (
        <div className="msg-translation">
          <div className="msg-translation-head">
            <Languages size={12} strokeWidth={2.4} aria-hidden="true" />
            {result.source === "ai"
              ? `${DETECTED[result.detected] ?? result.detected} → ${LANG_LABEL[target]} · AI, check before acting`
              : "Sheng glossary"}
          </div>
          {result.translation && <p>{result.translation}</p>}
          {result.glossary.length > 0 && (
            <dl className="gloss">
              {result.glossary.map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.meaning}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.note && (
            <div className="msg-note">
              <TriangleAlert size={12} strokeWidth={2.4} aria-hidden="true" />
              {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * For agents: rewrite a draft reply in the client's language before sending.
 * The translation replaces the draft so the agent reads it first.
 */
export function DraftTranslate({
  draft,
  onTranslated,
}: {
  draft: string;
  onTranslated: (text: string) => void;
}) {
  const [busy, setBusy] = useState<TargetLang | null>(null);
  const [error, setError] = useState("");

  const run = async (target: TargetLang) => {
    if (!draft.trim()) return;
    setBusy(target);
    setError("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft, target }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Translation failed.");
      else if (body.translation?.translation) onTranslated(body.translation.translation);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="draft-translate">
      <Languages size={12} strokeWidth={2.4} aria-hidden="true" />
      Reply in
      {(["sw", "sheng", "en"] as TargetLang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => run(l)}
          disabled={!draft.trim() || busy !== null}
        >
          {busy === l ? "…" : LANG_LABEL[l]}
        </button>
      ))}
      {error && <span className="err">{error}</span>}
    </span>
  );
}
