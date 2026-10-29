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
You are chatting in a messaging app, like texting a close friend. Instead of one long block, send 1–${MAX_BUBBLES} short messages ("bubbles"), the way a real person fires off a few quick texts. Put a line containing only ${BUBBLE_DELIMITER} between bubbles. Each bubble is one or two sentences. Short, casual replies can be a single bubble.

The user's latest messages may be numbered like [1], [2], [3] because they sent several in a row. Reply to all of them naturally in one go. When a bubble answers a specific earlier message (not just the last one), start that bubble with [reply:N] — e.g. "[reply:1] haha yes, I remember that". Don't use [reply:N] on every bubble, only when it helps clarity. Never number your own bubbles or mention this format.

Example:
Hey you! 💚
${BUBBLE_DELIMITER}
[reply:1] That meeting sounds exhausting, how did it end?
${BUBBLE_DELIMITER}
And yes, pizza tonight is a great idea`;

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

/** Split a long single paragraph into ~2–3 natural bubbles at sentence boundaries. */
function splitBySentences(text: string): string[] {
  if (text.length < 80 || /```|\n\s*[-*\d]+[.)]?\s/.test(text)) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean);
  if (!sentences || sentences.length < 2) return [text];
  const target = Math.min(3, Math.max(2, Math.round(text.length / 120)));
  const per = Math.ceil(sentences.length / target);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(" "));
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
 * Parse one model reply into chat bubbles.
 * @param batchSize number of user bubbles in the latest batch (to validate [reply:N]).
 */
export function splitReply(raw: string, batchSize = 1): ReplyBubble[] {
  const text = (raw || "").trim();
  if (!text) return [];

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
    parts = splitBySentences(text);
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

  // Too many bubbles feels spammy — fold the tail into the last allowed bubble.
  if (bubbles.length > MAX_BUBBLES) {
    const head = bubbles.slice(0, MAX_BUBBLES - 1);
    const tail = bubbles.slice(MAX_BUBBLES - 1);
    const merged: ReplyBubble = { text: tail.map((b) => b.text).join("\n\n") };
    if (tail[0].replyTo) merged.replyTo = tail[0].replyTo;
    head.push(merged);
    bubbles = head;
  }

  // Quoting the bubble the user *just* sent is redundant when nothing else is quoted.
  if (batchSize >= 1 && bubbles.every((b) => !b.replyTo || b.replyTo === batchSize)) {
    bubbles = bubbles.map((b) => ({ text: b.text }));
  }

  return bubbles.length ? bubbles : [{ text: clean(text) || text }];
}
