/**
 * Multi-bubble chat helpers.
 *
 * One provider call → several short chat bubbles. The model is asked to
 * separate bubbles with a line containing only `|||` and may prefix a bubble
 * with `[reply:N]` to quote the user's N-th message from the latest batch.
 * Everything here is pure post-processing — never an extra AI request.
 */

export const BUBBLE_DELIMITER = "|||";
export const MAX_BUBBLES = 4;

export interface ReplyBubble {
  text: string;
  /** 1-based index into the user's latest batch of bubbles, if the model quoted one. */
  replyTo?: number;
}

export const BUBBLE_FORMAT_PROMPT = `## How you text
You are chatting in a messaging app, like texting a close friend. You write ONE reply, but you may break it into a few short messages ("bubbles") by putting a line containing only ${BUBBLE_DELIMITER} between them — the app shows each part as its own bubble. Never write more than ${MAX_BUBBLES}.

Pick the number of bubbles the moment calls for — it should vary from message to message, never a fixed habit:
- A greeting, quick ack, or tiny message ("hi", "ok", "lol", "gn") → usually just ONE short bubble. No delimiter at all.
- A normal message → one or two bubbles.
- Something long, emotional, or several topics/questions at once → a few bubbles, one thought each.
Each bubble is a single thought, usually one sentence, rarely two. Don't pad a reply just to make more bubbles.

The user's latest messages may be numbered like [1], [2], [3] because they sent several in a row. Reply to all of them naturally in one go. When a bubble answers a specific earlier message (not just the last one), start that bubble with [reply:N] — e.g. "[reply:1] haha yes, I remember that". Only use [reply:N] when it helps clarity. Never number your own bubbles or mention this format.

Write like a real person texting, not a formal letter: casing, punctuation, and abbreviations follow the "Match their texting style" notes below.

Examples (casual texter):
User: hi
You: heyy 💚 how's ur day going

User: [1] ugh work was so long [2] my boss yelled at me in front of everyone [3] also i think i'm getting sick
You: [reply:2] wait he yelled at u in front of everyone?? that's so not ok
${BUBBLE_DELIMITER}
[reply:3] and ur getting sick on top of it 😩 have u eaten anything
${BUBBLE_DELIMITER}
tell me what happened, i'm here`;

/** How many bubbles this turn should be, decided from what the user just sent. */
export interface BubbleBudget {
  /** The count to aim for (hinted to the model; used when we have to split ourselves). */
  target: number;
  /** Hard ceiling — extra parts are merged down to this. */
  max: number;
}

const TINY_RE =
  /^(?:h+i+|he+y+|hello+|yo+|sup|wassup|hiya|gm|gn|good ?(?:morning|night|evening|afternoon)|ok(?:ay)?|k+|kk|lol+|lmao+|haha+|hehe+|ya+|yea+h?|yes+|yep|yup|no+|nope|nah|thanks?|thx|ty|cool|nice|same|bye+|cya|ttyl|brb|wbu|hbu|u\?|you\?|[\p{Extended_Pictographic}\s]+)[\s!?.~]*$/iu;
const EMOTION_RE =
  /\b(?:sad|cry(?:ing)?|cried|depress\w*|anxious|anxiety|scared|afraid|lonely|alone|hurt|angry|upset|stressed|stress|panic\w*|broke up|breakup|died|death|passed away|miss (?:you|u|him|her|them)|hate|tired of|exhausted|overwhelm\w*|worried|nervous|heartbroken|excited|so happy|got the job|engaged|pregnant)\b/i;

function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Adaptive bubble budget for one reply. Pure + deterministic.
 *  - "hi" / "ok" / an emoji → 1 bubble (cap 2, so a natural "hey! | how was ur day" still fits)
 *  - one ordinary sentence → 1 (cap 2)
 *  - a couple of sentences / questions, or 2 bubbles → 2 (cap 3)
 *  - long, emotional, or a burst of 3+ bubbles / several questions → 3 (cap 4)
 */
export function bubbleBudget(userBubbles: string[]): BubbleBudget {
  const parts = userBubbles.map((b) => b.trim()).filter(Boolean);
  if (!parts.length) return { target: 1, max: 2 };
  const all = parts.join(" ");
  const words = wordCount(all);
  const questions = (all.match(/\?+/g) || []).length;
  const sentences = (all.match(/[^.!?…\n]+[.!?…]*/g) || []).filter((x) => wordCount(x) >= 2).length;
  const emotional = EMOTION_RE.test(all);

  if (parts.every((p) => TINY_RE.test(p)) && words <= 6) return { target: 1, max: 2 };

  let score = 0;
  if (words > 12) score++;
  if (words > 35) score++;
  if (words > 80) score++;
  if (parts.length >= 2) score++;
  if (parts.length >= 3) score++;
  if (questions >= 2) score++;
  if (sentences >= 3) score++;
  if (emotional) score++;

  if (score <= 0) return { target: 1, max: 2 };
  if (score <= 2) return { target: 2, max: 3 };
  if (score <= 4) return { target: 3, max: MAX_BUBBLES };
  return { target: MAX_BUBBLES, max: MAX_BUBBLES };
}

/** One-line, per-turn hint for the system prompt. */
export function bubbleBudgetHint(b: BubbleBudget): string {
  if (b.target <= 1)
    return `## This reply\nKeep it to ONE short bubble (no ${BUBBLE_DELIMITER}) unless a second tiny one feels genuinely natural. Never more than ${b.max}.`;
  return `## This reply\nAround ${b.target} bubbles feels right here (fewer is fine if that's more natural). Never more than ${b.max}.`;
}

/** Recover the user's individual bubbles from a formatted batch ("[1] a\n[2] b"). */
export function batchToBubbles(currentMessage: string): string[] {
  const lines = currentMessage.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => /^\[\d+\]/.test(l))) return lines.map((l) => l.replace(/^\[\d+\]\s*/, ""));
  return [currentMessage];
}

export interface BatchItem {
  content: string;
  /** Short snippet of the message this bubble quotes, if any. */
  quote?: { role: string; content: string } | null;
}

function snippet(text: string, max = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Turn the user's batch of bubbles into the single "current message" sent to the model. */
export function formatUserBatch(items: BatchItem[]): string {
  const withQuote = (it: BatchItem) =>
    it.quote
      ? `(replying to ${it.quote.role === "assistant" ? "your" : "their own"} message: "${snippet(it.quote.content)}") ${it.content}`
      : it.content;
  if (items.length === 1) return withQuote(items[0]);
  return items.map((it, i) => `[${i + 1}] ${withQuote(it)}`).join("\n");
}

const REPLY_TAG = /^\s*\[\s*reply\s*[:=]?\s*#?(\d+)\s*\]\s*/i;
// Any stray tag the model leaks mid-text, or numbered prefixes like "[1]" it copied.
const STRAY_TAGS = /\[\s*reply\s*[:=]?\s*#?\d+\s*\]\s*/gi;

function clean(text: string) {
  return text
    .replace(STRAY_TAGS, "")
    .replace(/^\s*\[\d+\]\s*/, "")
    .replace(/^\s*(?:-{3,}|\|{2,})\s*$/gm, "")
    .trim();
}

/** Split a long single paragraph into up to `target` natural bubbles at sentence boundaries. */
function splitBySentences(text: string, target: number): string[] {
  if (target <= 1 || text.length < 90 || /```|\n\s*[-*\d]+[.)]?\s/.test(text)) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean);
  if (!sentences || sentences.length < 2) return [text];
  // Never more pieces than the length supports (~45 chars per bubble minimum).
  const n = Math.max(1, Math.min(target, sentences.length, Math.floor(text.length / 45)));
  if (n <= 1) return [text];
  const per = Math.ceil(sentences.length / n);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(" "));
  return out;
}

/** Merge the shortest adjacent pair until there are at most `max` bubbles. */
function mergeDown(bubbles: ReplyBubble[], max: number): ReplyBubble[] {
  const out = bubbles.map((b) => ({ ...b }));
  while (out.length > Math.max(1, max)) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      // Don't glue a quoted reply onto a different quote if we can avoid it.
      const penalty = out[i + 1].replyTo && out[i + 1].replyTo !== out[i].replyTo ? 1000 : 0;
      const len = out[i].text.length + out[i + 1].text.length + penalty;
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const a = out[best];
    const b = out[best + 1];
    const merged: ReplyBubble = { text: `${a.text} ${b.text}` };
    const replyTo = a.replyTo ?? b.replyTo;
    if (replyTo) merged.replyTo = replyTo;
    out.splice(best, 2, merged);
  }
  return out;
}

function tryJson(raw: string): unknown[] | null {
  const t = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!t.startsWith("[")) return null;
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Parse ONE model reply into chat bubbles (pure post-processing, never an AI call).
 * @param batchSize number of user bubbles in the latest batch (to validate [reply:N]).
 * @param budget adaptive bubble budget for this turn (see `bubbleBudget`).
 */
export function splitReply(
  raw: string,
  batchSize = 1,
  budget: BubbleBudget = { target: 2, max: MAX_BUBBLES }
): ReplyBubble[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const max = Math.min(MAX_BUBBLES, Math.max(1, budget.max));

  let parts: string[];
  const json = tryJson(text);
  if (json && json.every((x) => typeof x === "string" || (x && typeof x === "object"))) {
    parts = json.map((x) =>
      typeof x === "string"
        ? x
        : (() => {
            const o = x as { text?: string; content?: string; replyTo?: number };
            const t = o.text ?? o.content ?? "";
            return o.replyTo ? `[reply:${o.replyTo}] ${t}` : t;
          })()
    );
  } else if (text.includes(BUBBLE_DELIMITER)) {
    parts = text.split(/\s*\|\|\|+\s*/);
  } else if (/\n\s*\n/.test(text) && !/```/.test(text)) {
    parts = text.split(/\n\s*\n/);
  } else {
    // No delimiter: only split a genuinely long block, and only as far as this turn warrants.
    parts = splitBySentences(text, Math.min(budget.target, max));
  }

  let bubbles = parts
    .map((p) => {
      const m = p.match(REPLY_TAG);
      const n = m ? Number(m[1]) : undefined;
      const body = clean(m ? p.slice(m[0].length) : p);
      const valid = n !== undefined && n >= 1 && n <= batchSize;
      return valid ? { text: body, replyTo: n } : { text: body };
    })
    .filter((b): b is ReplyBubble => b.text.length > 0) as ReplyBubble[];

  // Too many bubbles for this turn feels spammy — merge the shortest neighbours.
  if (bubbles.length > max) bubbles = mergeDown(bubbles, max);

  // Quoting the bubble the user *just* sent is redundant when nothing else is quoted.
  if (batchSize >= 1 && bubbles.every((b) => !b.replyTo || b.replyTo === batchSize)) {
    bubbles = bubbles.map((b) => ({ text: b.text }));
  }

  return bubbles.length ? bubbles : [{ text: clean(text) || text }];
}
