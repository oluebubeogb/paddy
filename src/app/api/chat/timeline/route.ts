import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getCurrentConversation } from "@/lib/chat/sessions";
import { messageSelect } from "@/lib/chat/message-select";

/**
 * The endless main chat: the newest messages across all of the user's active
 * sessions, newest page first, paginated by message-id cursor. Never loads the
 * whole history — older pages load as the user scrolls up.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 40) || 40, 1), 100);

  const current = cursor ? null : await getCurrentConversation(user.id);

  const rows = await prisma.message.findMany({
    where: { userId: user.id, conversation: { userId: user.id, status: "active" } },
    orderBy: [{ createdAt: "desc" }, { sequence: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  return NextResponse.json(
    {
      conversationId: current?.id ?? null,
      messages: page,
      nextCursor: hasMore ? (page[0]?.id ?? null) : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
