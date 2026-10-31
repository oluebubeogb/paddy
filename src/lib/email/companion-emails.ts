/**
 * Companion emails (birthday, memories, check-ins) in the same Paddy-chat
 * layout as the secret-phrase mail. The header chip shows what the mail is
 * about (🎂 Birthday, 🧠 Memories, 💚 Checking in) instead of "Companion".
 *
 * Templates only — nothing here sends on its own. Call sendEmail() from
 * ./transport once a sender (worker job + user opt-in) exists.
 *
 * Tone: warm, casual, "let it develop" — never product copy.
 */

import { appUrl } from "@/lib/auth/challenges";
import { escapeHtml, highlightBlock, renderChatEmail } from "./chat-layout";
import type { EmailMessage } from "./transport";

function greet(name?: string | null) {
  const n = name?.trim();
  return n ? `hey ${n}` : "hey you";
}

/** Split a free-form Paddy message into chat bubbles (paragraphs / sentences). */
export function toBubbles(message: string, max = 4): string[] {
  const paras = message
    .split(/\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts =
    paras.length > 1 ? paras : message.match(/[^.!?…]+[.!?…]+["')\]]*|\S[^.!?…]*$/g)?.map((s) => s.trim()) ?? [message];
  if (parts.length <= max) return parts.filter(Boolean);
  const head = parts.slice(0, max - 1);
  return [...head, parts.slice(max - 1).join(" ")];
}

export function renderBirthdayEmail(input: { name?: string | null; baseUrl?: string }): EmailMessage {
  const base = (input.baseUrl ?? appUrl()).replace(/\/+$/, "");
  const subject = `happy birthday${input.name ? `, ${input.name.trim()}` : ""} 🎂`;
  const { html, text } = renderChatEmail({
    subject,
    preheader: "it's your day — I didn't forget 💚",
    context: "birthday",
    dayLabel: "today",
    baseUrl: base,
    paddy: [
      `${greet(input.name)} 🎂`,
      "it's your day!! I didn't forget 💚",
      "hope today's soft on you. tell me everything later?",
    ],
    actions: [{ label: "aww thank you 💚", href: `${base}/chat`, variant: "primary" }],
  });
  return { subject, html, text };
}

export function renderMemoryEmail(input: {
  name?: string | null;
  /** What Paddy remembers, e.g. "your job interview on Friday". */
  memory: string;
  /** Optional nudge, e.g. "how did it go?" */
  question?: string;
  baseUrl?: string;
}): EmailMessage {
  const base = (input.baseUrl ?? appUrl()).replace(/\/+$/, "");
  const subject = "remember this? 💭";
  const q = input.question?.trim() || "how's that going?";
  const { html, text } = renderChatEmail({
    subject,
    preheader: `something you told me… ${input.memory}`.slice(0, 120),
    context: "memories",
    baseUrl: base,
    paddy: [
      `${greet(input.name)} 👋`,
      {
        html: `this popped into my head 💭${highlightBlock(input.memory, { label: "Paddy remembers" })}`,
        text: `this popped into my head 💭\n\n    "${input.memory}"\n`,
      },
      q,
    ],
    actions: [
      { label: "let me tell you", href: `${base}/chat`, variant: "primary" },
      { label: "what else do you remember?", href: `${base}/memories`, variant: "secondary" },
    ],
    notes: ["you can edit or delete anything Paddy remembers in Memories"],
  });
  return { subject, html, text };
}

export function renderCheckInEmail(input: {
  name?: string | null;
  /** The proactive message Paddy wrote (one AI call) — split into bubbles here. */
  message: string;
  /** Optional header context override (e.g. an event → "Life"). */
  context?: "checkIn" | "life" | "companion";
  baseUrl?: string;
}): EmailMessage {
  const base = (input.baseUrl ?? appUrl()).replace(/\/+$/, "");
  const bubbles = toBubbles(input.message);
  const subject = `${bubbles[0]?.slice(0, 60) || "thinking of you"} 💚`;
  const { html, text } = renderChatEmail({
    subject,
    preheader: input.message.slice(0, 120),
    context: input.context ?? "checkIn",
    baseUrl: base,
    paddy: bubbles,
    actions: [{ label: "reply to Paddy", href: `${base}/chat`, variant: "primary" }],
  });
  return { subject, html, text };
}

export { escapeHtml };
