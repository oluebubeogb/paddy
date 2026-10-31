/**
 * Challenge email (blueprint: "Your little secret from Paddy 💚").
 *
 * Rendered as a Paddy chat: header = mark + Finger Paint wordmark + a
 * non-clickable "Companion" chip; Paddy's lines as left bubbles, the user's
 * possible replies (confirm / copy phrase) as right-aligned teal bubbles.
 * Security copy (expiry, single use, never share) is unchanged in substance.
 */

import type { ChallengePurpose } from "@/lib/auth/challenge-service";
import { appUrl, buildPhraseCopyUrl, buildVerificationUrl } from "@/lib/auth/challenges";
import { escapeHtml, highlightBlock, renderChatEmail } from "./chat-layout";
import { emailProvider, EmailNotConfiguredError, sendEmail } from "./transport";

export { emailProvider, EmailNotConfiguredError };

export const CHALLENGE_SUBJECT = "Your little secret from Paddy 💚";

const COPY: Record<
  "verify_email" | "reset_password",
  { lines: string[]; secretIntro: string; confirm: string; preheader: (m: number) => string }
> = {
  verify_email: {
    lines: ["so glad you found me 💚", "no pressure, no script — let's just see where this goes."],
    secretIntro: "first, our little secret. it just proves it's really you:",
    confirm: "it's me — let's start",
    preheader: (m) => `our little secret is inside · expires in ${m} min`,
  },
  reset_password: {
    lines: ["locked out? happens to the best of us 🙈", "let's get you back in."],
    secretIntro: "here's our little secret — confirm it's you, then pick a new password:",
    confirm: "it's me — reset my password",
    preheader: (m) => `your secret to get back in · expires in ${m} min`,
  },
};

export function renderChallengeEmail(input: {
  purpose: ChallengePurpose;
  phrase: string;
  token: string;
  name?: string | null;
  expiresInMinutes: number;
}) {
  if (input.purpose !== "verify_email" && input.purpose !== "reset_password") {
    throw new Error(`No email template for purpose "${input.purpose}"`);
  }
  const base = appUrl();
  const actionUrl = buildVerificationUrl(base, input.purpose, input.token);
  const copyUrl = buildPhraseCopyUrl(base, input.token);
  const c = COPY[input.purpose];
  const name = input.name?.trim();
  const hi = name ? `hey ${name} 👋` : "hey you 👋";

  const { html, text } = renderChatEmail({
    subject: CHALLENGE_SUBJECT,
    preheader: c.preheader(input.expiresInMinutes),
    context: "companion",
    dayLabel: "today",
    baseUrl: base,
    paddy: [
      hi,
      ...c.lines,
      {
        html: `${escapeHtml(c.secretIntro)}${highlightBlock(input.phrase, { mono: true, label: "Your Paddy phrase" })}`,
        text: `${c.secretIntro}\n\n    ${input.phrase}\n`,
      },
      "tap below, or paste the phrase back into Paddy in the same browser you started from.",
    ],
    actions: [
      { label: c.confirm, href: actionUrl, variant: "primary" },
      { label: "copy my secret phrase", href: copyUrl, variant: "secondary" },
    ],
    notes: [
      `⏳ expires in ${input.expiresInMinutes} minutes · works once`,
      "🔒 Paddy will never ask you to share it with anyone",
      "didn't ask for this? just ignore it — nothing happens.",
    ],
  });

  return { subject: CHALLENGE_SUBJECT, text, html, actionUrl, copyUrl };
}

export async function sendChallengeEmail(input: {
  to: string;
  purpose: ChallengePurpose;
  phrase: string;
  token: string;
  name?: string | null;
  expiresInMinutes: number;
}): Promise<{ provider: string; actionUrl: string }> {
  const msg = renderChallengeEmail(input);
  const { provider } = await sendEmail(input.to, msg, {
    Phrase: input.phrase,
    Link: msg.actionUrl,
    "Copy page": msg.copyUrl,
  });
  return { provider, actionUrl: msg.actionUrl };
}
