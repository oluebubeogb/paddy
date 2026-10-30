/**
 * Challenge email delivery (blueprint: "Your little secret from Paddy 💚").
 *
 * Provider order:
 *   1. Resend   — when RESEND_API_KEY is set (HTTP API, no extra deps)
 *   2. SMTP     — when SMTP_HOST is set (nodemailer)
 *   3. Dev log  — only when NODE_ENV !== "production"
 * In production with no provider configured, sending throws
 * EmailNotConfiguredError so callers can fail loudly instead of silently.
 */

import type { ChallengePurpose } from "@/lib/auth/challenge-service";
import { appUrl, buildPhraseCopyUrl, buildVerificationUrl } from "@/lib/auth/challenges";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("No email provider configured (set RESEND_API_KEY or SMTP_HOST)");
  }
}

export const CHALLENGE_SUBJECT = "Your little secret from Paddy 💚";

export function emailProvider(): "resend" | "smtp" | "dev-log" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.NODE_ENV !== "production") return "dev-log";
  return "none";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COPY: Record<"verify_email" | "reset_password", { intro: string; button: string }> = {
  verify_email: {
    intro: "Here's your little secret. Use it to confirm it's really you and finish setting up Paddy.",
    button: "Confirm it's me",
  },
  reset_password: {
    intro: "Let's get you back in. Use this little secret to confirm it's really you, then choose a new password.",
    button: "Reset my password",
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
  const hi = input.name ? `Hi ${input.name},` : "Hi there,";

  const text = [
    hi,
    "",
    c.intro,
    "",
    "YOUR PADDY PHRASE",
    `  ${input.phrase}`,
    "",
    `${c.button}: ${actionUrl}`,
    "",
    "Or copy the phrase above and paste it back into Paddy, in the same browser you started from.",
    `Copy my secret phrase: ${copyUrl}`,
    "",
    `This little secret expires in ${input.expiresInMinutes} minutes and works once.`,
    "Paddy will never ask you to share it with anyone. If you didn't request this, you can safely ignore this email.",
    "",
    "— Paddy 💚",
  ].join("\n");

  const p = escapeHtml(input.phrase);
  const logo = escapeHtml(`${base}/icon-192.png`);
  const home = escapeHtml(base);
  const preheader = escapeHtml(`Your Paddy phrase is inside — expires in ${input.expiresInMinutes} minutes.`);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(CHALLENGE_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ef;font-family:${font};color:#1c1917;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;padding:36px 12px">
<tr><td align="center">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px">
<tr><td align="center" style="padding:0 0 20px">
<a href="${home}" style="text-decoration:none;color:#1c1917">
<img src="${logo}" width="44" height="44" alt="Paddy" style="display:block;margin:0 auto 10px;width:44px;height:44px;border:0;border-radius:12px">
<span style="font-size:15px;font-weight:600;letter-spacing:-.01em;color:#1c1917">Paddy</span>
</a>
</td></tr>

<tr><td style="background:#ffffff;border-radius:20px;border:1px solid #ece9e4;overflow:hidden">
<div style="height:4px;background:#0f766e;background-image:linear-gradient(90deg,#2dd4bf,#0f766e);border-radius:20px 20px 0 0;line-height:4px;font-size:0">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:30px 30px 28px">
<p style="margin:0 0 6px;font-size:15px;color:#57534e">${escapeHtml(hi)}</p>
<p style="margin:0 0 22px;font-size:16px;line-height:1.55;color:#1c1917">${escapeHtml(c.intro)}</p>

<p style="margin:0 0 8px;font-size:11px;letter-spacing:.1em;font-weight:600;color:#78716c;text-transform:uppercase">Your Paddy phrase</p>
<div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:14px;padding:16px 18px;font-size:19px;line-height:1.4;font-weight:600;color:#134e4a;text-align:center;letter-spacing:.01em;user-select:all;-webkit-user-select:all">${p}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0"><tr><td align="center">
<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 30px;border-radius:999px">${escapeHtml(c.button)}</a>
</td></tr>
<tr><td align="center" style="padding:14px 0 0">
<a href="${escapeHtml(copyUrl)}" style="font-size:14px;color:#0f766e;font-weight:500;text-decoration:none">Copy my secret phrase &rarr;</a>
</td></tr></table>

<div style="margin:26px 0 0;padding:14px 0 0;border-top:1px solid #f0ede8">
<p style="margin:0;font-size:13px;line-height:1.55;color:#78716c">&#9203; Expires in <strong style="color:#57534e;font-weight:600">${input.expiresInMinutes} minutes</strong> and works once.</p>
<p style="margin:6px 0 0;font-size:13px;line-height:1.55;color:#78716c">Paddy will never ask you to share it with anyone. If you didn't request this, you can safely ignore this email.</p>
</div>
</td></tr></table>
</td></tr>

<tr><td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.5;color:#a8a29e">
Sent by Paddy &middot; your AI companion<br>
<a href="${home}" style="color:#a8a29e;text-decoration:underline">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table>

</td></tr></table>
</body></html>`;

  return { subject: CHALLENGE_SUBJECT, text, html, actionUrl, copyUrl };
}

async function sendViaResend(to: string, msg: { subject: string; text: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Paddy <onboarding@resend.dev>",
      to: [to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

async function sendViaSmtp(to: string, msg: { subject: string; text: string; html: string }) {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM || "Paddy <no-reply@localhost>",
    to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
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
  const provider = emailProvider();
  switch (provider) {
    case "resend":
      await sendViaResend(input.to, msg);
      break;
    case "smtp":
      await sendViaSmtp(input.to, msg);
      break;
    case "dev-log":
      console.log("──────── PADDY EMAIL (dev log, not sent) ────────");
      console.log("To:", input.to);
      console.log("Subject:", msg.subject);
      console.log("Phrase:", input.phrase);
      console.log("Link:", msg.actionUrl);
      console.log("Copy page:", msg.copyUrl);
      console.log("─────────────────────────────────────────────────");
      break;
    default:
      throw new EmailNotConfiguredError();
  }
  return { provider, actionUrl: msg.actionUrl };
}
