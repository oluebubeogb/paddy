/**
 * Content-based session titles — computed locally, never an extra AI call.
 *
 * Looks at the first few user bubbles of a session, skips pure greetings /
 * filler ("hi", "lol", "good morning"), and turns the first meaningful message
 * into a short 2–6 word label such as "Stressed about work" or
 * "Job interview tomorrow".
 */

const MAX_WORDS = 6;
const MAX_CHARS = 42;

/** Whole messages that carry no topic on their own. */
const FILLER_RE =
  /^(?:(?:hi+|hey+|hello+|heya|hiya|yo+|sup|wassup|what'?s up|wsg|howdy|hola|gm|gn|good (?:morning|afternoon|evening|night|day)|morning|evening|night|ok(?:ay)?|k+|kk|yes+|yeah|yep|ya|no+|nope|nah|lol+|lmao+|haha+|hehe+|thanks?|thank you|thx|ty|cool|nice|great|sure|hmm+|umm*|ah+|oh+|wow|same|fr|true|right|bye|brb|ttyl|how are (?:you|u)(?: doing)?(?: today)?|how(?:'?s| is) it going|how(?:'?s| is) (?:your|ur) day|wbu|hbu|and you|ugh+|omg+|bruh+|damn|oof|idk|you\??|u\??|i(?:'?m| am) (?:good|fine|ok(?:ay)?|great)|not much|nothing much|paddy|my love|babe|love|dear|friend|bestie|buddy)[\s,!.?~]*)+$/i;

/** Lead-ins stripped from the start of a message before titling. */
const LEAD_INS = [
  /^(?:hi+|hey+|hello+|heya|yo+|gm|good (?:morning|afternoon|evening))\b[\s,!.]*(?:paddy|there|love|babe|bestie)?[\s,!.]*/i,
  /^(?:so+|well|um+|uh+|ugh+|omg+|ok(?:ay)?|anyway[s]?|btw|jsyk|tbh|honestly|basically|actually|lol|haha+)\b[\s,!.]*/i,
  /^(?:can|could|would|will) (?:you|u) (?:please |pls |plz )?(?:help me (?:with |to )?|tell me (?:about )?|talk (?:to me )?about )?/i,
  /^(?:i (?:want|wanna|need|would like|'d like) to (?:talk|chat|vent|tell you) (?:about|that)?|let'?s talk about|guess what|you know what)[\s,:!.-]*/i,
  /^(?:i (?:just )?(?:wanted|want) to (?:say|tell you|let you know)(?: that)?)[\s,:!.-]*/i,
  /^(?:i (?:really |just |kinda )?(?:want|wanna|need|have|got|plan|hope|'?m trying|am trying) to )/i,
  /^i (?:just )?(?=\w+ed\b|got\b|did\b|made\b|won\b|lost\b|met\b|saw\b|had\b)/i,
];

const STOPWORDS = new Set(
  (
    "a an the and or but if so of to in on at by for from with about into over after before than then " +
    "i im i'm me my mine myself you u ur your yours we us our they them their he him his she her it its " +
    "is am are was were be been being do does did doing have has had having will would shall should can could may might must " +
    "this that these those there here what which who whom whose when where why how " +
    "just really very so too also still even ever already maybe kinda sorta like literally actually basically " +
    "not no yes yeah ok okay lol haha hmm um uh oh pls plz please thanks thx " +
    "get got getting go going gonna wanna gotta want need feel feeling felt think thought know knew " +
    "some any all every much many more most lot lots thing things stuff something anything everything " +
    "today now rn tho though because cause cuz bc since while again honestly tbh kinda idk front"
  ).split(" ")
);

/** Emotion words → normalised label used in "<Feeling> about <topic>". */
const FEELINGS: Record<string, string> = {
  stressed: "Stressed",
  stress: "Stressed",
  anxious: "Anxious",
  nervous: "Nervous",
  worried: "Worried",
  scared: "Scared",
  sad: "Sad",
  upset: "Upset",
  depressed: "Feeling low",
  down: "Feeling down",
  lonely: "Lonely",
  tired: "Tired",
  exhausted: "Exhausted",
  burnt: "Burnt out",
  overwhelmed: "Overwhelmed",
  angry: "Angry",
  mad: "Mad",
  annoyed: "Annoyed",
  frustrated: "Frustrated",
  happy: "Happy",
  excited: "Excited",
  hyped: "Hyped",
  proud: "Proud",
  grateful: "Grateful",
  bored: "Bored",
  confused: "Confused",
  heartbroken: "Heartbroken",
};

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;

export function cleanText(s: string): string {
  return s
    .replace(URL_RE, " ")
    .replace(EMOJI_RE, " ")
    .replace(/[*_`~#>|[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for messages that are only greetings / small talk. */
export function isFiller(text: string): boolean {
  const t = cleanText(text).toLowerCase();
  if (!t) return true;
  if (!/[a-z0-9]/i.test(t)) return true;
  return FILLER_RE.test(t);
}

function stripLeadIns(s: string): string {
  let out = s;
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const re of LEAD_INS) out = out.replace(re, "");
    out = out.trim();
    if (out === before) break;
  }
  return out;
}

function firstSentence(s: string): string {
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  const first = (m ? m[0] : s).trim();
  // A tiny first sentence ("ugh.") isn't informative — take the next one too.
  if (first.split(/\s+/).length < 3 && m) return s.trim();
  return first;
}

function words(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}'’\- ]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['’-]+|['’-]+$/g, ""))
    .filter(Boolean);
}

function contentWords(ws: string[]): string[] {
  return ws.filter((w) => {
    const l = w.toLowerCase().replace(/’/g, "'");
    return !STOPWORDS.has(l) && !/^(?:i'?m|i'?ve|i'?ll|i'?d|it'?s|that'?s|don'?t|can'?t|won'?t|didn'?t|isn'?t)$/.test(l);
  });
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Keep acronyms/proper-looking words, lowercase SHOUTED words. */
function tidyWord(w: string): string {
  if (w.length > 4 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w.toLowerCase();
  return w;
}

function clamp(title: string): string {
  let t = title.replace(/\s+/g, " ").replace(/[\s,;:.!?-]+$/g, "").trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const sp = cut.lastIndexOf(" ");
    t = (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,;:.!?-]+$/g, "");
  }
  return capitalize(t);
}

/** "I'm so stressed about my exam" → "Stressed about exam". */
function feelingTitle(text: string): string | null {
  const ws = words(text.toLowerCase());
  for (let i = 0; i < ws.length; i++) {
    const label = FEELINGS[ws[i]];
    if (!label) continue;
    if (ws[i] === "down" && !/\b(?:feel|feeling|felt|so|been|kinda|really|bit)\b\s+down\b/i.test(text)) continue;
    // Look for a topic after "about / with / because of / over".
    const rest = ws.slice(i + 1);
    const link = rest.findIndex((w) => ["about", "with", "over", "because", "cause", "cuz", "bc", "at", "for"].includes(w));
    if (link >= 0 && link <= 3) {
      const topic = contentWords(rest.slice(link + 1)).filter((w) => !FEELINGS[w]).slice(0, 3);
      if (topic.length) return `${label} about ${topic.join(" ")}`;
    }
    // "I have a job interview … and I'm nervous about it" → topic came first.
    const earlier = contentWords(ws.slice(0, i)).filter((w) => !FEELINGS[w] && !/^(?:have|had|got)$/.test(w));
    if (earlier.length) return `${label} about ${earlier.slice(0, 2).join(" ")}`;
    // Otherwise pair it with the first nearby content word ("exam stress").
    const near = contentWords(rest).filter((w) => !FEELINGS[w.toLowerCase()]).slice(0, 2);
    if (near.length) return `${label} · ${near.join(" ")}`;
    return `Feeling ${label.toLowerCase().replace(/^feeling /, "")}`;
  }
  return null;
}

/**
 * Build a short title from the first user messages of a session.
 * Returns null when there's nothing meaningful yet (e.g. only "hi").
 */
export function titleFromMessages(texts: string[]): string | null {
  const meaningful = texts
    .slice(0, 6)
    .map(cleanText)
    .filter((t) => t && !isFiller(t));
  if (!meaningful.length) return null;

  // Use the first meaningful message; borrow from the next if it's very short.
  let source = stripLeadIns(firstSentence(meaningful[0]));
  if (words(source).length < 3 && meaningful[1]) {
    source = `${source} ${stripLeadIns(firstSentence(meaningful[1]))}`.trim();
  }
  if (!source || !/[\p{L}\p{N}]/u.test(source)) return null;

  const feeling = feelingTitle(source);
  if (feeling) return clamp(feeling);

  const ws = words(source).map(tidyWord);
  if (!ws.length) return null;

  // Already short and readable → use as-is (minus a trailing "?").
  if (ws.length <= MAX_WORDS && source.length <= MAX_CHARS) {
    const short = source.replace(/[?!.]+$/g, "");
    if (contentWords(ws).length >= 1) return clamp(short);
  }

  // Otherwise use the first clause with substance, then its first content words.
  const clauses = source.split(/\s*(?:[,;:–—]|\band\b|\bbut\b|\bbecause\b|\bcuz\b)\s*/i).filter(Boolean);
  const clause = clauses.find((c) => contentWords(words(c)).length >= 2) ?? source;
  const keys = contentWords(words(clause).map(tidyWord));
  const picked = (keys.length >= 2 ? keys : ws).slice(0, 4);
  if (!picked.length) return null;
  return clamp(picked.join(" "));
}
