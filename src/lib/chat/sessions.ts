/**
 * Chat sessions — the main chat feels like one endless conversation, while
 * history is quietly archived into weekly-ish sessions (browsable in Memories).
 *
 * The *current* session is the user's newest active conversation. It rotates
 * when it's been open for a week, or after a few quiet days, so no single
 * conversation grows forever and every page load stays a small, paginated query.
 */
import { prisma } from "@/lib/db";
import { titleFromMessages } from "@/lib/chat/session-title";

export const SESSION_MAX_DAYS = 7;
export const SESSION_IDLE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_SESSION_TITLE = "New conversation";

interface SessionLike {
  createdAt: Date;
  lastMessageAt: Date | null;
}

/** Should a fresh session start? Empty sessions are always reused. */
export function needsRotation(conv: SessionLike, now: Date = new Date()): boolean {
  if (!conv.lastMessageAt) return false;
  const age = now.getTime() - conv.createdAt.getTime();
  const idle = now.getTime() - conv.lastMessageAt.getTime();
  return age >= SESSION_MAX_DAYS * DAY || idle >= SESSION_IDLE_DAYS * DAY;
}

const fmtDay = (d: Date, withYear = false) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** "Oct 23 – Oct 30" style label for an archived session. */
export function sessionTitle(start: Date, end: Date, now: Date = new Date()): string {
  const withYear = start.getUTCFullYear() !== now.getUTCFullYear();
  const a = fmtDay(start, withYear);
  const b = fmtDay(end, withYear);
  return a === b ? a : `${a} – ${b}`;
}

export function isDefaultTitle(title: string | null | undefined) {
  return !title || title === DEFAULT_SESSION_TITLE;
}

const DATE_LABEL = String.raw`[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?`;
const DATE_RANGE_RE = new RegExp(`^${DATE_LABEL}(?: – ${DATE_LABEL})?$`);

/** Titles Paddy generated itself (placeholder or date range) — safe to replace with a content title. */
export function isAutoReplaceableTitle(title: string | null | undefined) {
  return isDefaultTitle(title) || DATE_RANGE_RE.test(title!.trim());
}

/** How many of a session's first user bubbles feed the content title. */
const TITLE_SOURCE_MESSAGES = 6;

/**
 * Name a session from what was said in it (local heuristic — no AI call).
 * Only replaces placeholder / date-range titles. Returns the new title, if any.
 */
export async function autoTitleConversation(conversationId: string): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  });
  if (!conv || !isAutoReplaceableTitle(conv.title)) return null;
  const firstUser = await prisma.message.findMany({
    where: { conversationId, role: "user" },
    orderBy: [{ createdAt: "asc" }, { sequence: "asc" }],
    take: TITLE_SOURCE_MESSAGES,
    select: { content: true },
  });
  const title = titleFromMessages(firstUser.map((m) => m.content));
  if (!title || title === conv.title) return null;
  // Guard against a concurrent manual rename: only overwrite the title we read.
  const res = await prisma.conversation.updateMany({
    where: { id: conversationId, title: conv.title },
    data: { title },
  });
  return res.count ? title : null;
}

/** Give a finished session a content title, else a date range (unless the user/system named it). */
export async function archiveTitle(conv: { id: string; title: string | null; createdAt: Date; lastMessageAt: Date | null }) {
  if (!isDefaultTitle(conv.title) || !conv.lastMessageAt) return;
  if (await autoTitleConversation(conv.id).catch(() => null)) return;
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { title: sessionTitle(conv.createdAt, conv.lastMessageAt) },
  });
}

/** Start a brand-new session (e.g. "New chat" in Memories), archiving the current one. */
export async function startNewSession(userId: string) {
  const current = await prisma.conversation.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (current && !current.lastMessageAt) return current; // reuse an empty one
  if (current) await archiveTitle(current);
  return prisma.conversation.create({ data: { userId, title: DEFAULT_SESSION_TITLE } });
}

/** The session new messages go to — created/rotated on demand. */
export async function getCurrentConversation(userId: string, now: Date = new Date()) {
  const current = await prisma.conversation.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!current) {
    return prisma.conversation.create({ data: { userId, title: DEFAULT_SESSION_TITLE } });
  }
  if (!needsRotation(current, now)) return current;
  await archiveTitle(current);
  return prisma.conversation.create({ data: { userId, title: DEFAULT_SESSION_TITLE } });
}
