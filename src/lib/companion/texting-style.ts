/**
 * Adaptive texting style — Paddy mirrors how *this* user texts.
 *
 *  - Abbreviations ("u", "jsyk", "idk"…) are mirrored only when the user uses them.
 *    Users who write full, autocorrected English get full words back.
 *  - Casual lowercase texters get casual casing (not every bubble capitalised).
 *
 * Pure & deterministic: one prompt hint + light post-processing on the bubbles
 * of the single AI call. Never an extra request.
 */

/** Known texting abbreviations → full form used when the user doesn't abbreviate. */
export const ABBREVIATIONS: Record<string, string> = {
  u: "you",
  ur: "your",
  urs: "yours",
  jsyk: "just so you know",
  idk: "I don't know",
  idc: "I don't care",
  tbh: "to be honest",
  ngl: "not gonna lie",
  rn: "right now",
  btw: "by the way",
  imo: "in my opinion",
  imho: "in my honest opinion",
  fr: "for real",
  pls: "please",
  plz: "please",
  thx: "thanks",
  tho: "though",
  cuz: "because",
  bc: "because",
  nvm: "never mind",
  wyd: "what are you doing",
  hbu: "how about you",
  wbu: "what about you",
  ikr: "I know, right",
  prolly: "probably",
  ppl: "people",
  abt: "about",
  smth: "something",
  bday: "birthday",
  tmrw: "tomorrow",
  tmr: "tomorrow",
  ily: "I love you",
  omw: "on my way",
  lmk: "let me know",
  dw: "don't worry",
  ofc: "of course",
  def: "definitely",
  obv: "obviously",
  ttyl: "talk to you later",
  irl: "in real life",
  bf: "boyfriend",
  gf: "girlfriend",
};

/** Casual markers that signal an abbreviating texter but are fine to leave as-is. */
const CASUAL_MARKERS = new Set(["lol", "lmao", "lmfao", "omg", "haha", "hahaha", "brb", "smh", "k", "kk", "ok", "gonna", "wanna", "gotta", "ty", "np", "yh", "ye", "yea", "nah"]);

export interface TextingStyle {
  /** Abbreviations (lowercase keys of ABBREVIATIONS) the user actually uses. */
  abbreviations: string[];
  /** User mostly starts messages lowercase / types loosely. */
  casualCasing: boolean;
  /** User writes clean, autocorrected English — no abbreviations at all. */
  formal: boolean;
  /** How many user messages the read is based on. */
  sample: number;
}

const WORD = /[A-Za-z']+/g;

function words(text: string): string[] {
  return (text.match(WORD) ?? []).map((w) => w.toLowerCase());
}

/** Read the user's texting style from their recent messages (newest last). */
export function analyzeTextingStyle(userMessages: string[]): TextingStyle {
  const msgs = userMessages
    .map((m) => m.replace(/^\s*\[\d+\]\s*/gm, "").trim())
    .filter((m) => /[A-Za-z]/.test(m))
    .slice(-15);

  const used = new Set<string>();
  let casualMarkers = 0;
  let lowerStarts = 0;
  let upperStarts = 0;
  let lowerI = 0;
  let punctuated = 0;
  let multiWord = 0;

  for (const m of msgs) {
    const ws = words(m);
    for (const w of ws) {
      if (w in ABBREVIATIONS) used.add(w);
      if (CASUAL_MARKERS.has(w)) casualMarkers++;
    }
    if (/(^|\s)i(\s|'|$)/.test(m)) lowerI++;
    const first = m.match(/[A-Za-z]/)?.[0];
    if (first) {
      if (first === first.toLowerCase()) lowerStarts++;
      else upperStarts++;
    }
    if (ws.length >= 3) {
      multiWord++;
      if (/[.!?…)]\s*$|\p{Extended_Pictographic}\s*$/u.test(m)) punctuated++;
    }
  }

  // "u" alone is ambiguous in a single message (e.g. a list) — still counts; it's how people text.
  const lettered = lowerStarts + upperStarts;
  const lowerRatio = lettered ? lowerStarts / lettered : 0;
  const casualCasing = msgs.length > 0 && (lowerRatio >= 0.5 || lowerI > 0);
  const punctRatio = multiWord ? punctuated / multiWord : 0;
  const formal =
    msgs.length > 0 &&
    used.size === 0 &&
    lowerI === 0 &&
    lowerRatio <= 0.2 &&
    (multiWord === 0 || punctRatio >= 0.4) &&
    casualMarkers === 0;

  return { abbreviations: [...used].sort(), casualCasing, formal, sample: msgs.length };
}

/** One short section for the system prompt. */
export function buildTextingStylePrompt(style: TextingStyle): string {
  const lines: string[] = ["## Match their texting style"];
  if (style.abbreviations.length) {
    lines.push(
      `The user texts with abbreviations like ${style.abbreviations.map((a) => `"${a}"`).join(", ")}. Mirror that naturally — you can use those same ones (only those), the way a friend texting fast would. Don't overdo it; not every bubble.`
    );
  } else {
    lines.push(
      'The user writes words out in full. Do NOT use texting abbreviations (no "u", "ur", "idk", "jsyk", "tbh", "rn"…) — spell words out.'
    );
  }
  if (style.casualCasing) {
    lines.push(
      "They text casually in lowercase. Match it: start most bubbles lowercase, keep punctuation light, skip the trailing full stop. Don't capitalise every sentence."
    );
  } else if (style.formal) {
    lines.push("They write tidy, autocorrected sentences. Use normal capitalisation and punctuation.");
  } else {
    lines.push("Keep casing natural and relaxed — it's a chat, not an essay.");
  }
  return lines.join("\n");
}

const ABBR_RE = new RegExp(`(^|[^A-Za-z'’.@/#])(${Object.keys(ABBREVIATIONS).join("|")})(?=$|[^A-Za-z'’@])`, "gi");

function expandAbbreviations(text: string, allowed: Set<string>): string {
  if (/```|https?:\/\//.test(text)) return text;
  return text.replace(ABBR_RE, (match, pre: string, abbr: string, offset: number) => {
    const key = abbr.toLowerCase();
    if (allowed.has(key)) return match;
    // Leave ALL-CAPS tokens (likely acronyms/names, e.g. "BF Goodrich") unless they're the classic shouty ones.
    if (abbr.length > 1 && abbr === abbr.toUpperCase() && !["IDK", "TBH", "BTW", "JSYK", "NGL", "IMO", "LMK", "OMW"].includes(abbr)) return match;
    let full = ABBREVIATIONS[key];
    const atStart = offset + pre.length === 0 || /[.!?]\s*$/.test(text.slice(0, offset + pre.length));
    if (atStart && /^[a-z]/.test(full) && abbr[0] === abbr[0].toUpperCase()) full = full[0].toUpperCase() + full.slice(1);
    return pre + full;
  });
}

/** Lowercase the first letter of a bubble when it's an ordinary capitalised word. */
function casualStart(text: string): string {
  const m = /^([^A-Za-z]*)([A-Z])([a-z][A-Za-z']*)/.exec(text);
  if (!m) return text;
  const word = m[2] + m[3];
  // Keep "I", "I'm", "I'll"… and anything that looks like a name / proper noun we can't judge.
  if (/^I($|')/.test(word)) return text;
  if (COMMON_STARTS.has(word.toLowerCase())) {
    return m[1] + m[2].toLowerCase() + text.slice(m[1].length + 1);
  }
  return text;
}

/** Everyday words that commonly open a text — safe to lowercase (never names). */
const COMMON_STARTS = new Set(
  (
    "a an and are as at aw aww awww be but by can could did do does don't done for from good got great had has have haha hahaha he hey hi hmm honestly how if in is it it's just let let's like lol maybe me mine my nah no not oh ok okay omg on oof or ooh same she so sounds sorry sure that that's the then there they this tho though to too totally ugh um wait want was we well what what's when where which who why will with wow yay yeah yes yep you you're your yup also actually already always anyway any aww babe congrats damn did didn't glad gonna happy hope i'd love lowkey makes miss mood night nice noted of omg one only please proud real right seriously should so's sounds still super thank thanks that'll tonight tomorrow true try very wanna would yikes"
  ).split(/\s+/)
);

/** Post-process one AI bubble to fit the user's style. */
export function applyTextingStyle(text: string, style: TextingStyle): string {
  if (!style.sample) return text;
  let out = expandAbbreviations(text, new Set(style.abbreviations));
  if (style.casualCasing) {
    out = casualStart(out);
    // Casual texters rarely end a bubble with a lone full stop.
    out = out.replace(/(?<![.\d])\.(\s*)$/, "$1").trimEnd();
  }
  return out;
}
