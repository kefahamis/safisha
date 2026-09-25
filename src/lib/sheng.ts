/*
 * A reference glossary of Nairobi Sheng, plus the everyday Kiswahili that comes
 * up in waste-collection conversations. Used two ways:
 *   1. On its own, to flag slang in a message and show what it means.
 *   2. As grounding for the AI translator, so it reads slang the way Nairobi does.
 *
 * Only terms with a settled meaning are listed; Sheng shifts fast and varies by
 * estate, so the translator is told to flag anything it is unsure of rather
 * than guess.
 */

export interface GlossEntry {
  term: string;
  /** Other spellings people type. */
  alt?: string[];
  meaning: string;
  kind: "sheng" | "swahili";
}

export const GLOSSARY: GlossEntry[] = [
  // greetings and fillers
  { term: "niaje", alt: ["niajee", "niajeh"], meaning: "hi, what's up", kind: "sheng" },
  { term: "sasa", meaning: "hi (as a greeting); also 'now'", kind: "sheng" },
  { term: "mambo", meaning: "hi, how are things", kind: "swahili" },
  { term: "vipi", meaning: "how's it going / how", kind: "swahili" },
  { term: "poa", meaning: "fine, cool", kind: "sheng" },
  { term: "fiti", meaning: "fine, well, in good shape", kind: "sheng" },
  { term: "sawa", alt: ["sawasawa"], meaning: "okay, alright", kind: "swahili" },
  { term: "maze", alt: ["manze", "maze"], meaning: "man, dude (exclamation)", kind: "sheng" },
  { term: "bana", meaning: "man, dude (filler)", kind: "sheng" },
  { term: "jo", meaning: "man, bro (tag at the end of a sentence)", kind: "sheng" },
  { term: "aki", meaning: "honestly, oh my (exclamation)", kind: "sheng" },
  { term: "fom", alt: ["form"], meaning: "the plan, what's happening ('fom ni gani?' = what's the plan?)", kind: "sheng" },
  { term: "rada", meaning: "awareness, the information ('uko rada?' = are you aware?)", kind: "sheng" },
  { term: "noma", meaning: "serious, tough, a problem ('kuna noma' = there's a problem)", kind: "sheng" },
  { term: "ngori", meaning: "trouble, a difficult situation", kind: "sheng" },
  { term: "sai", meaning: "now, right now (from 'saa hii')", kind: "sheng" },
  { term: "kitambo", meaning: "a long time ago, for a while", kind: "sheng" },

  // people and places
  { term: "msee", alt: ["wasee"], meaning: "person, guy (wasee = people)", kind: "sheng" },
  { term: "manzi", meaning: "young woman", kind: "sheng" },
  { term: "dem", alt: ["dame"], meaning: "woman, girlfriend", kind: "sheng" },
  { term: "chali", meaning: "young man, boyfriend", kind: "sheng" },
  { term: "buda", alt: ["budaa"], meaning: "father, old man", kind: "sheng" },
  { term: "mathe", alt: ["mathee"], meaning: "mother", kind: "sheng" },
  { term: "beshte", alt: ["mabeshte"], meaning: "friend (mabeshte = friends)", kind: "sheng" },
  { term: "morio", meaning: "guy, bro", kind: "sheng" },
  { term: "mbogi", meaning: "crew, group of friends", kind: "sheng" },
  { term: "mtoi", alt: ["watoi"], meaning: "child", kind: "sheng" },
  { term: "mboch", meaning: "house help, domestic worker", kind: "sheng" },
  { term: "keja", meaning: "house, home", kind: "sheng" },
  { term: "base", meaning: "home, one's place", kind: "sheng" },
  { term: "mtaa", alt: ["mitaa"], meaning: "neighbourhood, estate", kind: "swahili" },
  { term: "ocha", meaning: "rural home, upcountry", kind: "sheng" },
  { term: "ushago", meaning: "rural home, upcountry", kind: "sheng" },
  { term: "kanairo", meaning: "Nairobi", kind: "sheng" },
  { term: "kanjo", meaning: "county council enforcement officers", kind: "sheng" },
  { term: "karao", alt: ["sanse"], meaning: "police", kind: "sheng" },
  { term: "askari", meaning: "security guard (at a gate or estate)", kind: "swahili" },
  { term: "mat", alt: ["matatu"], meaning: "minibus taxi", kind: "sheng" },

  // money
  { term: "doh", alt: ["doo"], meaning: "money", kind: "sheng" },
  { term: "ganji", meaning: "money", kind: "sheng" },
  { term: "mullah", meaning: "money", kind: "sheng" },
  { term: "chapaa", meaning: "money", kind: "sheng" },
  { term: "thao", meaning: "a thousand shillings", kind: "sheng" },
  { term: "soo", meaning: "a hundred shillings", kind: "sheng" },
  { term: "kusota", alt: ["nimesota", "amesota"], meaning: "to be broke (nimesota = I'm broke)", kind: "sheng" },
  { term: "kuomoka", alt: ["ameomoka"], meaning: "to become well off, to make it", kind: "sheng" },
  { term: "pesa", meaning: "money", kind: "swahili" },
  { term: "deni", meaning: "debt, amount owed", kind: "swahili" },
  { term: "bili", meaning: "bill", kind: "swahili" },
  { term: "risiti", meaning: "receipt", kind: "swahili" },
  { term: "kulipa", alt: ["nimelipa", "umelipa", "tumelipa", "lipa"], meaning: "to pay (nimelipa = I have paid)", kind: "swahili" },
  { term: "mara mbili", meaning: "twice", kind: "swahili" },

  // verbs people use in complaints
  { term: "kucheki", alt: ["cheki", "chekiwa"], meaning: "to check, to look at", kind: "sheng" },
  { term: "kushow", alt: ["hawajashow", "ameshow", "show"], meaning: "to show up, to come", kind: "sheng" },
  { term: "kubonga", alt: ["bonga"], meaning: "to talk, to chat", kind: "sheng" },
  { term: "kuboeka", alt: ["nimeboeka", "ameboeka"], meaning: "to be fed up, annoyed", kind: "sheng" },
  { term: "kuchill", alt: ["chill"], meaning: "to wait, to relax", kind: "sheng" },
  { term: "ngoja", meaning: "wait", kind: "swahili" },
  { term: "wacha", meaning: "stop it, leave it", kind: "swahili" },
  { term: "hawajakuja", alt: ["hawakuja", "hawajafika"], meaning: "they haven't come / didn't come", kind: "swahili" },

  // waste and collection
  { term: "taka", alt: ["takataka"], meaning: "rubbish, garbage", kind: "swahili" },
  { term: "kuzoa", alt: ["kuzoa taka", "wazoa taka"], meaning: "to collect rubbish (wazoa taka = garbage collectors)", kind: "swahili" },
  { term: "gari ya taka", alt: ["lori ya taka"], meaning: "the garbage truck", kind: "swahili" },
  { term: "pipa", meaning: "bin, drum", kind: "swahili" },
  { term: "dasbini", alt: ["dastbin", "dustbin"], meaning: "dustbin", kind: "sheng" },
  { term: "mfuko", alt: ["mifuko"], meaning: "bag, sack (mifuko = bags)", kind: "swahili" },
  { term: "gunia", meaning: "sack", kind: "swahili" },
  { term: "uchafu", meaning: "dirt, filth, waste", kind: "swahili" },
  { term: "jaa", meaning: "dump site", kind: "swahili" },
  { term: "kutupa", alt: ["wametupa", "kutupwa"], meaning: "to throw away, to dump", kind: "swahili" },
  { term: "mtaro", meaning: "drain, ditch", kind: "swahili" },
  { term: "kunuka", alt: ["inanuka"], meaning: "to smell bad (inanuka = it stinks)", kind: "swahili" },
  { term: "harufu", meaning: "smell, odour", kind: "swahili" },
  { term: "imejaa", alt: ["zimejaa"], meaning: "it's full (bins are full)", kind: "swahili" },
  { term: "geti", alt: ["gate"], meaning: "gate", kind: "sheng" },

  // time
  { term: "leo", meaning: "today", kind: "swahili" },
  { term: "jana", meaning: "yesterday", kind: "swahili" },
  { term: "kesho", meaning: "tomorrow", kind: "swahili" },
  { term: "wiki hii", meaning: "this week", kind: "swahili" },
  { term: "asubuhi", meaning: "morning", kind: "swahili" },
  { term: "jioni", meaning: "evening", kind: "swahili" },
];

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");

/** Terms from the glossary that appear in a message, longest phrases first. */
export function lookupTerms(text: string): GlossEntry[] {
  const hay = ` ${normal(text).replace(/\s+/g, " ")} `;
  const found: GlossEntry[] = [];
  for (const entry of GLOSSARY) {
    const forms = [entry.term, ...(entry.alt ?? [])];
    if (forms.some((f) => hay.includes(` ${normal(f).trim()} `))) found.push(entry);
  }
  return found;
}

/** Compact form of the glossary for the translator's instructions. */
export function glossaryForPrompt(): string {
  return GLOSSARY.map(
    (g) => `${[g.term, ...(g.alt ?? [])].join(" / ")} (${g.kind}): ${g.meaning}`,
  ).join("\n");
}
