// Server-only. Chat translation between English, Kiswahili and Sheng (Claude).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { glossaryForPrompt, lookupTerms } from "@/lib/sheng";
import { loadSetting } from "../settings";

export type TargetLang = "en" | "sw" | "sheng";

export const TranslationSchema = z.object({
  /** The language the message was written in. */
  detected: z.enum(["english", "kiswahili", "sheng", "mixed", "other"]),
  translation: z.string(),
  /** Slang or idioms worth explaining to the reader. */
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })),
  /** Anything ambiguous the reader should double-check before acting. */
  note: z.string(),
});

export type Translation = z.infer<typeof TranslationSchema> & {
  target: TargetLang;
  source: "ai" | "glossary";
};

const LANG_NAME: Record<TargetLang, string> = {
  en: "clear, plain English",
  sw: "standard Kiswahili as spoken in Nairobi",
  sheng: "natural Nairobi Sheng, as a friendly care agent would text it",
};

// Stable across calls so it can be cached: the task, then the glossary.
const SYSTEM = `You translate customer-care messages for a Nairobi waste-collection company. Messages move between clients (households and businesses) and the company's care desk, and are often written in Sheng, Kiswahili, English, or a mix of all three.

Translate faithfully. Keep names, client numbers (like TS-KIL-02436), M-Pesa receipt codes, amounts, dates and times exactly as written. Keep the tone: a polite complaint stays polite, an angry one stays firm. Don't add information that isn't in the message.

Sheng changes quickly and varies between estates. Use the glossary below as the reference for common terms. When a word could mean more than one thing, or you don't recognise it, translate your best reading and say so in "note" — a care agent will act on your translation, so a flagged uncertainty is better than a confident guess. Leave "note" empty when there is nothing to flag.

In "glossary", list the slang or idioms from the original message that a reader of the translation might want explained, with their meaning in context. Leave it empty for plain messages.

Glossary:
${glossaryForPrompt()}`;

async function aiConfig() {
  const s = await loadSetting("platform", "ai");
  if (!s || s.status !== "ok" || !s.secrets.apiKey) return null;
  return { apiKey: s.secrets.apiKey, model: String(s.config.model || "claude-opus-5") };
}

export const translateAvailable = async () => (await aiConfig()) !== null;

/** Checks the key and that the chosen model is available to it. */
export async function testAi(apiKey: string, model: string) {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  try {
    const m = await client.models.retrieve(model);
    return { ok: true, detail: `Connected. ${m.display_name} is available.` };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, detail: "Anthropic rejected the API key." };
    if (err instanceof Anthropic.PermissionDeniedError)
      return { ok: false, detail: "This key doesn't have access to the selected model." };
    if (err instanceof Anthropic.NotFoundError) return { ok: false, detail: `Model ${model} was not found.` };
    if (err instanceof Anthropic.APIError) return { ok: false, detail: `Anthropic returned HTTP ${err.status}.` };
    return { ok: false, detail: "Could not reach Anthropic." };
  }
}

/** Glossary-only fallback: flags slang without translating the sentence. */
function glossaryOnly(text: string, target: TargetLang): Translation {
  const terms = lookupTerms(text);
  return {
    detected: terms.some((t) => t.kind === "sheng") ? "sheng" : terms.length ? "kiswahili" : "other",
    translation: "",
    glossary: terms.map((t) => ({ term: t.term, meaning: t.meaning })),
    note: "Full translation needs the Anthropic key in Settings. Terms found in the Sheng glossary are listed.",
    target,
    source: "glossary",
  };
}

export class TranslateError extends Error {}

/**
 * Translates one chat message. `context` is the few messages before it, so a
 * short reply like "bado" can be read in light of the conversation.
 */
export async function translate(text: string, target: TargetLang, context: string[] = []): Promise<Translation> {
  const cfg = await aiConfig();
  if (!cfg) return glossaryOnly(text, target);

  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: 60_000, maxRetries: 2 });
  const prior = context.length
    ? `Earlier in the conversation, for context only (do not translate):\n${context.map((c) => `- ${c}`).join("\n")}\n\n`
    : "";

  try {
    const response = await client.beta.messages.parse({
      model: cfg.model,
      max_tokens: 4000,
      // Refused requests are retried on a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Chat translation is latency-sensitive; low effort suits it.
      output_config: { effort: "low", format: betaZodOutputFormat(TranslationSchema) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `${prior}Translate this message into ${LANG_NAME[target]}:\n\n${text}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new TranslateError("The translator declined this message.");
    }
    if (!response.parsed_output) {
      throw new TranslateError("The translator returned an unreadable answer. Try again.");
    }
    return { ...response.parsed_output, target, source: "ai" };
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    if (err instanceof Anthropic.AuthenticationError)
      throw new TranslateError("The Anthropic key was rejected. Check it in Settings.");
    if (err instanceof Anthropic.RateLimitError)
      throw new TranslateError("Translation is busy right now. Try again in a moment.");
    if (err instanceof Anthropic.APIError) throw new TranslateError(`Translation failed (HTTP ${err.status}).`);
    throw new TranslateError("Could not reach the translation service.");
  }
}
