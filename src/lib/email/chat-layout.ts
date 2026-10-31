/**
 * Paddy "chat in your inbox" email layout.
 *
 * Every Paddy email reads like a conversation:
 *   header  — Paddy mark + Finger Paint "Paddy" wordmark + a non-clickable
 *             context chip (Companion by default; Memories, Birthday… when the
 *             mail is about that), mirroring the app's header nav.
 *   body    — Paddy's lines as left-aligned chat bubbles.
 *   actions — what the user can do, as right-aligned teal "user" bubbles
 *             (the reply they'd send), not generic marketing buttons.
 *   notes   — small centered system pills (expiry, safety), like a chat app.
 *
 * Email-client notes:
 *   - Table layout + inline styles (Gmail/Outlook strip most <head> CSS).
 *   - The wordmark is a PNG rendered from Finger Paint (public/email/
 *     paddy-wordmark.png) so it looks right even where web fonts are stripped
 *     (Gmail). Its alt text, the footer wordmark and anything else using
 *     BRAND_FONT get Finger Paint via @font-face (self-hosted /fonts/, with the
 *     Google Fonts stylesheet as a backup) and a web-safe fallback.
 */

import { appUrl } from "@/lib/auth/challenges";

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const BODY_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Finger Paint with web-safe fallbacks (quotes are HTML-attribute safe). */
export const BRAND_FONT =
  "'Finger Paint','Chalkboard SE','Comic Sans MS','Segoe Print',cursive,sans-serif";

const C = {
  page: "#f4f2ef",
  chat: "#faf8f5",
  card: "#ffffff",
  border: "#ece9e4",
  ink: "#1c1917",
  muted: "#78716c",
  faint: "#a8a29e",
  teal: "#0d9488",
  tealDeep: "#0f766e",
  tealInk: "#134e4a",
  tealSoft: "#e3f3f0",
  tealWash: "#f0fdfa",
  tealLine: "#ccfbf1",
};

/** Header chip presets. Any custom label/icon is also accepted. */
export const EMAIL_CONTEXTS = {
  companion: { label: "Companion", icon: "✦" },
  memories: { label: "Memories", icon: "🧠" },
  birthday: { label: "Birthday", icon: "🎂" },
  life: { label: "Life", icon: "📅" },
  checkIn: { label: "Checking in", icon: "💚" },
} as const;

export type EmailContext =
  | keyof typeof EMAIL_CONTEXTS
  | { label: string; icon?: string };

/** A Paddy bubble: plain text (escaped) or trusted inner HTML built here. */
export type PaddyBubble = string | { html: string; text: string };

export type UserAction = {
  label: string;
  href: string;
  /** Primary = solid teal (the obvious reply); secondary = soft teal. */
  variant?: "primary" | "secondary";
};

export type ChatEmailInput = {
  subject: string;
  preheader: string;
  context?: EmailContext;
  /** Tiny centered label above the thread, e.g. "today". */
  dayLabel?: string;
  paddy: PaddyBubble[];
  actions?: UserAction[];
  /** Centered system-style notes under the thread (expiry, safety…). */
  notes?: string[];
  baseUrl?: string;
};

function resolveContext(ctx: EmailContext | undefined) {
  if (!ctx) return EMAIL_CONTEXTS.companion;
  return typeof ctx === "string" ? EMAIL_CONTEXTS[ctx] : ctx;
}

/** Highlighted block inside a Paddy bubble (secret phrase, a memory…). */
export function highlightBlock(content: string, opts: { mono?: boolean; label?: string } = {}) {
  const label = opts.label
    ? `<div style="margin:0 0 6px;font-size:10px;letter-spacing:.12em;font-weight:700;color:${C.tealDeep};text-transform:uppercase">${escapeHtml(opts.label)}</div>`
    : "";
  return `<div style="margin:10px 0 2px;background:${C.tealWash};border:1px solid ${C.tealLine};border-radius:14px;padding:12px 14px">${label}<div style="font-size:${opts.mono ? 18 : 15}px;line-height:1.45;font-weight:${opts.mono ? 700 : 500};color:${C.tealInk};letter-spacing:.01em;user-select:all;-webkit-user-select:all">${escapeHtml(content)}</div></div>`;
}

function paddyRow(b: PaddyBubble, first: boolean, last: boolean) {
  const inner = typeof b === "string" ? escapeHtml(b) : b.html;
  // Grouped like a chat app: tight left edge between bubbles, tail at the bottom.
  const radius = `${first ? 18 : 6}px 18px 18px ${last ? 4 : 6}px`;
  return `<tr><td align="left" style="padding:0 0 6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:84%"><tr>
<td style="background:${C.card};border:1px solid ${C.border};border-radius:${radius};padding:10px 14px;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${C.ink};text-align:left">${inner}</td>
</tr></table>
</td></tr>`;
}

function userRow(a: UserAction, first: boolean) {
  const primary = (a.variant ?? "primary") === "primary";
  const bg = primary ? C.teal : C.tealSoft;
  const fg = primary ? "#ffffff" : C.tealDeep;
  return `<tr><td align="right" style="padding:${first ? 10 : 0}px 0 6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:84%"><tr>
<td style="background:${bg};border-radius:18px 18px 6px 18px">
<a href="${escapeHtml(a.href)}" target="_blank" style="display:block;padding:10px 16px;font-family:${BODY_FONT};font-size:15px;line-height:1.4;font-weight:600;color:${fg};text-decoration:none;text-align:right">${escapeHtml(a.label)}&nbsp;&nbsp;&#8599;</a>
</td></tr></table>
</td></tr>`;
}

function noteRow(n: string) {
  return `<tr><td align="center" style="padding:4px 0 0">
<span style="display:inline-block;background:#efece7;border-radius:10px;padding:5px 10px;font-family:${BODY_FONT};font-size:12px;line-height:1.45;color:${C.muted}">${escapeHtml(n)}</span>
</td></tr>`;
}

export function renderChatEmail(input: ChatEmailInput): { html: string; text: string } {
  const base = (input.baseUrl ?? appUrl()).replace(/\/+$/, "");
  const ctx = resolveContext(input.context);
  const home = escapeHtml(base);
  const logo = escapeHtml(`${base}/icon-192.png`);
  const wordmark = escapeHtml(`${base}/email/paddy-wordmark.png`);
  const fontWoff2 = escapeHtml(`${base}/fonts/FingerPaint-Regular.woff2`);
  const fontWoff = escapeHtml(`${base}/fonts/FingerPaint-Regular.woff`);

  const bubbles = input.paddy
    .map((b, i) => paddyRow(b, i === 0, i === input.paddy.length - 1))
    .join("\n");
  const actions = (input.actions ?? []).map((a, i) => userRow(a, i === 0)).join("\n");
  const notes = (input.notes ?? []).map(noteRow).join("\n");
  const day = input.dayLabel
    ? `<tr><td align="center" style="padding:0 0 12px"><span style="font-family:${BODY_FONT};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.faint}">${escapeHtml(input.dayLabel)}</span></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Finger+Paint&amp;display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Finger Paint';font-style:normal;font-weight:400;font-display:swap;src:url('${fontWoff2}') format('woff2'),url('${fontWoff}') format('woff');}
.paddy-wordmark{font-family:${BRAND_FONT} !important;}
@media (max-width:520px){.paddy-shell{padding:18px 8px !important}.paddy-thread{padding:16px 12px 18px !important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${BODY_FONT};color:${C.ink};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}">
<tr><td align="center" class="paddy-shell" style="padding:32px 12px">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.card};border:1px solid ${C.border};border-radius:22px;overflow:hidden">

<!-- header: like the app nav -->
<tr><td style="padding:14px 18px;border-bottom:1px solid ${C.border};background:${C.card}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding:0 8px 0 0"><a href="${home}" target="_blank" style="text-decoration:none"><img src="${logo}" width="30" height="30" alt="" style="display:block;width:30px;height:30px;border:0;border-radius:9px"></a></td>
<td style="vertical-align:middle;padding:0 14px 0 0"><a href="${home}" target="_blank" class="paddy-wordmark" style="text-decoration:none;color:${C.tealDeep};font-family:${BRAND_FONT};font-size:20px;line-height:22px"><img src="${wordmark}" width="58" height="22" alt="Paddy" class="paddy-wordmark" style="display:block;width:58px;height:22px;border:0;font-family:${BRAND_FONT};font-size:20px;line-height:22px;color:${C.tealDeep}"></a></td>
<td style="vertical-align:middle"><span style="display:inline-block;background:${C.tealSoft};color:${C.tealDeep};border-radius:999px;padding:6px 12px;font-family:${BODY_FONT};font-size:13px;font-weight:600;line-height:1;white-space:nowrap;cursor:default">${escapeHtml(ctx.icon ?? "")}${ctx.icon ? "&nbsp;" : ""}${escapeHtml(ctx.label)}</span></td>
</tr></table>
</td></tr>

<!-- thread -->
<tr><td class="paddy-thread" style="background:${C.chat};padding:20px 18px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${day}
${bubbles}
${actions}
${notes}
</table>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td align="center" style="padding:18px 12px 0;font-family:${BODY_FONT};font-size:12px;line-height:1.6;color:${C.faint}">
<span class="paddy-wordmark" style="font-family:${BRAND_FONT};font-size:14px;color:${C.tealDeep}">Paddy</span> &middot; your AI companion<br>
<a href="${home}" target="_blank" style="color:${C.faint};text-decoration:underline">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table>

</td></tr></table>
</body></html>`;

  // Plain-text twin, written like a chat transcript.
  const lines: string[] = [`Paddy · ${ctx.label}`, ""];
  for (const b of input.paddy) lines.push(`Paddy: ${typeof b === "string" ? b : b.text}`);
  if (input.actions?.length) {
    lines.push("");
    for (const a of input.actions) lines.push(`You → ${a.label}: ${a.href}`);
  }
  if (input.notes?.length) {
    lines.push("");
    for (const n of input.notes) lines.push(`· ${n}`);
  }
  lines.push("", "— Paddy 💚", base);

  return { html, text: lines.join("\n") };
}
