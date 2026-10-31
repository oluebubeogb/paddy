import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { DEFAULT_SESSION_TITLE, autoTitleConversation, isAutoReplaceableTitle, isDefaultTitle, sessionTitle, startNewSession } from "@/lib/chat/sessions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id, status: "active" },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      lastMessageAt: true,
      _count: { select: { messages: true } },
    },
  });

  // Backfill content titles for sessions still named "New conversation" or a
  // date range (older builds). Local heuristic, capped so the list stays fast.
  const untitled = conversations
    .filter((c) => c._count.messages > 0 && isAutoReplaceableTitle(c.title))
    .slice(0, 8);
  if (untitled.length) {
    const titles = await Promise.all(untitled.map((c) => autoTitleConversation(c.id).catch(() => null)));
    untitled.forEach((c, i) => {
      if (titles[i]) c.title = titles[i];
    });
  }

  // The current session is the newest one created — it's the endless main chat.
  const currentId = conversations.reduce<(typeof conversations)[number] | null>(
    (best, c) => (!best || c.createdAt > best.createdAt ? c : best),
    null
  )?.id;

  return NextResponse.json({
    conversations: conversations.map(({ _count, ...c }) => ({
      ...c,
      // Archived sessions with no topical text yet fall back to their date range.
      title:
        c.id !== currentId && isDefaultTitle(c.title) && c.lastMessageAt
          ? sessionTitle(c.createdAt, c.lastMessageAt)
          : c.title,
      messageCount: _count.messages,
      isCurrent: c.id === currentId,
    })),
  });
}

const createSchema = z.object({
  title: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // "New chat" (from Memories) archives the current session and starts fresh.
  let conversation = await startNewSession(user.id);
  if (parsed.data.title && parsed.data.title !== DEFAULT_SESSION_TITLE) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title: parsed.data.title },
    });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
