/**
 * Email transport for every Paddy email.
 *
 * Provider order:
 *   1. Resend   — when RESEND_API_KEY is set (HTTP API, no extra deps)
 *   2. SMTP     — when SMTP_HOST is set (nodemailer)
 *   3. Dev log  — only when NODE_ENV !== "production"
 * In production with no provider configured, sending throws
 * EmailNotConfiguredError so callers can fail loudly instead of silently.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("No email provider configured (set RESEND_API_KEY or SMTP_HOST)");
  }
}

export type EmailMessage = { subject: string; text: string; html: string };

export function emailProvider(): "resend" | "smtp" | "dev-log" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.NODE_ENV !== "production") return "dev-log";
  return "none";
}

async function sendViaResend(to: string, msg: EmailMessage) {
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

async function sendViaSmtp(to: string, msg: EmailMessage) {
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

/**
 * Send any rendered Paddy email. `devLog` lines are printed instead of
 * sending when no provider is configured outside production.
 */
export async function sendEmail(
  to: string,
  msg: EmailMessage,
  devLog: Record<string, string> = {}
): Promise<{ provider: string }> {
  const provider = emailProvider();
  switch (provider) {
    case "resend":
      await sendViaResend(to, msg);
      break;
    case "smtp":
      await sendViaSmtp(to, msg);
      break;
    case "dev-log":
      console.log("──────── PADDY EMAIL (dev log, not sent) ────────");
      console.log("To:", to);
      console.log("Subject:", msg.subject);
      for (const [k, v] of Object.entries(devLog)) console.log(`${k}:`, v);
      console.log("─────────────────────────────────────────────────");
      break;
    default:
      throw new EmailNotConfiguredError();
  }
  return { provider };
}
