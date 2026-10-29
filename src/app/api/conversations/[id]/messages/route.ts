import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { generateCompanionBubbles } from "@/lib/companion/engine";
import { formatUserBatch, type BatchItem } from "@/lib/companion/bubbles";
import { randomUUID } from "crypto";
import { AIProviderError, aiProvider } from "@/lib/ai/provider";
import { retrieveRelevantMemories } from "@/lib/memory/store";
import { enqueueMemoryProcessing } from "@/lib/memory/process";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const bubbleSchema = z.object({
  content: z.string().min(1).max(8000),
  /** Quote an already-saved message in this conversation. */
  replyToId: z.string().min(1).max(64).optional(),
  /** Quote an earlier bubble in this same batch (0-based). */
  replyToIndex: z.number().int().min(0).max(15).optional(),
});

// Either a batch of user bubbles (multi-bubble chat) or the legacy single `content`.
const postSchema = z.union([
  z.object({ messages: z.array(bubbleSchema).min(1).max(12) }),
  bubbleSchema,
]);

const messageSelect = {
  id: true,
  role: true,
  content: true,
  origin: true,
  generationStatus: true,
  turnId: true,
  sequence: true,
  replyToId: true,
  createdAt: true,
  replyTo: { select: { id: true, role: true, content: true } },
} as const;

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id, status: "active" },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { sequence: "desc" }],
    take: limit,
    select: messageSelect,
  });

  return NextResponse.json({
    messages: messages.reverse(),
    nextCursor:
      messages.length === limit
        ? messages[0]?.createdAt.toISOString()
        : null,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id, status: "active" },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawItems = "messages" in parsed.data ? parsed.data.messages : [parsed.data];
  const items = rawItems
    .map((m, i) => ({ ...m, content: m.content.trim(), originalIndex: i }))
    .filter((m) => m.content.length > 0);
  if (!items.length) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (items.reduce((n, m) => n + m.content.length, 0) > 16000) {
    return NextResponse.json({ error: "That's a lot at once — try splitting it up." }, { status: 400 });
  }

  // Quoted messages must belong to this conversation.
  const quoteIds = [...new Set(items.map((m) => m.replyToId).filter((x): x is string => !!x))];
  const quoted = quoteIds.length
    ? await prisma.message.findMany({
        where: { id: { in: quoteIds }, conversationId: id },
        select: { id: true, role: true, content: true },
      })
    : [];
  const quotedById = new Map(quoted.map((q) => [q.id, q]));

  // Recent context (last 30 completed messages) — loaded BEFORE saving the new
  // bubbles so the current turn isn't sent to the model twice.
  const recent = await prisma.message.findMany({
    where: {
      conversationId: id,
      role: { in: ["user", "assistant"] },
      // (explicit null branch: SQL NOT IN drops NULL rows, e.g. proactive messages)
      OR: [{ generationStatus: null }, { generationStatus: { notIn: ["failed", "pending"] } }],
    },
    orderBy: [{ createdAt: "desc" }, { sequence: "desc" }],
    take: 30,
    select: { role: true, content: true },
  });
  const recentMessages = recent.reverse();

  // Persist the user's bubbles (one row each) + a pending assistant placeholder.
  // Explicit, strictly increasing timestamps keep bubble order stable.
  const userTurnId = randomUUID();
  const assistantTurnId = randomUUID();
  const base = Date.now();
  const userMessages: { id: string; content: string }[] = [];
  const batch: BatchItem[] = [];
  const createdIds: string[] = [];

  let assistantPlaceholderId: string | null = null;
  const started = Date.now();
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let replyToId: string | null = null;
      let quote: BatchItem["quote"] = null;
      if (it.replyToId && quotedById.has(it.replyToId)) {
        replyToId = it.replyToId;
        quote = quotedById.get(it.replyToId)!;
      } else if (it.replyToIndex !== undefined) {
        const target = items.findIndex((x) => x.originalIndex === it.replyToIndex);
        if (target >= 0 && target < i) {
          replyToId = userMessages[target].id;
          quote = { role: "user", content: userMessages[target].content };
        }
      }
      const row = await prisma.message.create({
        data: {
          conversationId: id,
          userId: user.id,
          role: "user",
          content: it.content,
          origin: "user",
          generationStatus: "completed",
          turnId: userTurnId,
          sequence: i,
          replyToId,
          createdAt: new Date(base + i),
        },
        select: { id: true, content: true },
      });
      createdIds.push(row.id);
      userMessages.push(row);
      batch.push({ content: it.content, quote });
    }

    const placeholder = await prisma.message.create({
      data: {
        conversationId: id,
        userId: user.id,
        role: "assistant",
        content: "",
        origin: "assistant",
        generationStatus: "pending",
        turnId: assistantTurnId,
        sequence: 0,
        createdAt: new Date(base + items.length),
      },
    });
    assistantPlaceholderId = placeholder.id;
    createdIds.push(placeholder.id);

    const combined = batch.map((b) => b.content).join("\n");

    // Retrieve relevant memories for context (non-blocking on failure)
    let relevantMemories: { category: string; content: string }[] = [];
    try {
      const memories = await retrieveRelevantMemories(user.id, combined, 6);
      relevantMemories = memories.map((m) => ({
        category: m.category,
        content: m.content,
      }));
    } catch (memErr) {
      console.warn("Memory retrieval skipped", memErr);
    }

    // ONE provider call for the whole batch; bubbles are split locally.
    const { bubbles } = await generateCompanionBubbles(
      {
        user: user as unknown as Parameters<typeof generateCompanionBubbles>[0]["user"],
        recentMessages,
        relevantMemories,
        currentMessage: formatUserBatch(batch),
      },
      batch.length
    );

    const replyBase = Math.max(Date.now(), base + items.length + 1);
    const assistantMessages = [];
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      const replyToId = b.replyTo ? (userMessages[b.replyTo - 1]?.id ?? null) : null;
      const data = {
        content: b.text,
        generationStatus: "completed",
        turnId: assistantTurnId,
        sequence: i,
        replyToId,
        createdAt: new Date(replyBase + i),
      };
      const row =
        i === 0
          ? await prisma.message.update({ where: { id: placeholder.id }, data, select: messageSelect })
          : await prisma.message.create({
              data: { ...data, conversationId: id, userId: user.id, role: "assistant", origin: "assistant" },
              select: messageSelect,
            });
      createdIds.push(row.id);
      assistantMessages.push(row);
    }

    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });

    // Extract memories in background — does not block the response
    enqueueMemoryProcessing(user.id, id);

    const savedUsers = await prisma.message.findMany({
      where: { id: { in: userMessages.map((m) => m.id) } },
      orderBy: { sequence: "asc" },
      select: messageSelect,
    });

    return NextResponse.json({
      userMessages: savedUsers,
      assistantMessages,
      // Legacy single-bubble fields (older clients).
      userMessage: savedUsers[savedUsers.length - 1],
      assistantMessage: assistantMessages[0],
    });
  } catch (err) {
    const elapsedMs = Date.now() - started;
    // Server-side diagnostics: never logs the API key or message content.
    console.error("[chat] AI generation failed", {
      conversationId: id,
      userId: user.id,
      elapsedMs,
      bubbles: items.length,
      provider: aiProvider.describe(),
      ...(err instanceof AIProviderError
        ? err.toLog()
        : { kind: "unknown", message: err instanceof Error ? err.message : String(err) }),
    });

    // Roll back this whole turn so a reload doesn't show a stale "trouble responding"
    // bubble and the client can put the text back in the composer for a retry.
    const ids = [...new Set([...createdIds, ...(assistantPlaceholderId ? [assistantPlaceholderId] : [])])];
    if (ids.length) {
      await prisma.message
        .deleteMany({ where: { id: { in: ids } } })
        .catch((e) => console.error("[chat] rollback failed", e));
    }

    const kind = err instanceof AIProviderError ? err.kind : "unknown";
    const error =
      kind === "timeout"
        ? "Paddy is taking too long to answer (the AI server may be waking up). Please try again."
        : kind === "config"
          ? "Paddy's AI isn't configured on the server yet."
          : "Paddy is having trouble responding right now. Please try again in a moment.";

    return NextResponse.json(
      { error, code: "ai_unavailable", reason: kind, retryable: kind !== "config" },
      { status: kind === "timeout" ? 504 : 502 }
    );
  }
}
