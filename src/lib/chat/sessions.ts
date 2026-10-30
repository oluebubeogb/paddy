/**
 * Chat sessions — the main chat feels like one endless conversation, while
 * history is quietly archived into weekly-ish sessions (browsable in Memories).
 *
 * The *current* session is the user's newest active conversation. It rotates
 * when it's been open for a week, or after a few quiet days, so no single
 * conversation grows forever and every page load stays a small, paginated query.
 */
import { prisma } from "@/lib/db";

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

function isDefaultTitle(title: string | null | undefined) {
  return !title || title === DEFAULT_SESSION_TITLE;
}

/** Give a finished session a date-range title (unless the user/system named it). */
export async function archiveTitle(conv: { id: string; title: string | null; createdAt: Date; lastMessageAt: Date | null }) {
  if (!isDefaultTitle(conv.title) || !conv.lastMessageAt) return;
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
