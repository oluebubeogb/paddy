import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { generateCompanionResponse } from "@/lib/companion/engine";
import { AIProviderError, aiProvider } from "@/lib/ai/provider";
import { retrieveRelevantMemories } from "@/lib/memory/store";
import { enqueueMemoryProcessing } from "@/lib/memory/process";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const postSchema = z.object({
  content: z.string().min(1).max(8000),
});

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
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      origin: true,
      generationStatus: true,
      createdAt: true,
    },
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

  const content = parsed.data.content.trim();
  if (!content) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  // Recent context (last 20 completed messages) — loaded BEFORE saving the new
  // message so the current turn isn't sent to the model twice.
  const recent = await prisma.message.findMany({
    where: {
      conversationId: id,
      role: { in: ["user", "assistant"] },
      // (explicit null branch: SQL NOT IN drops NULL rows, e.g. proactive messages)
      OR: [{ generationStatus: null }, { generationStatus: { notIn: ["failed", "pending"] } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { role: true, content: true },
  });
  const recentMessages = recent.reverse();

  // Persist user message
  const userMessage = await prisma.message.create({
    data: {
      conversationId: id,
      userId: user.id,
      role: "user",
      content,
      origin: "user",
      generationStatus: "completed",
    },
  });

  // Create pending assistant message
  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: id,
      userId: user.id,
      role: "assistant",
      content: "",
      origin: "assistant",
      generationStatus: "pending",
    },
  });

  const started = Date.now();
  try {
    // Retrieve relevant memories for context (non-blocking on failure)
    let relevantMemories: { category: string; content: string }[] = [];
    try {
      const memories = await retrieveRelevantMemories(user.id, content, 6);
      relevantMemories = memories.map((m) => ({
        category: m.category,
        content: m.content,
      }));
    } catch (memErr) {
      console.warn("Memory retrieval skipped", memErr);
    }

    const reply = await generateCompanionResponse({
      user: user as unknown as Parameters<typeof generateCompanionResponse>[0]["user"],
      recentMessages,
      relevantMemories,
      currentMessage: content,
    });

    const updated = await prisma.message.update({
      where: { id: assistantMessage.id },
      data: {
        content: reply,
        generationStatus: "completed",
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });

    // Extract memories in background — does not block the response
    enqueueMemoryProcessing(user.id, id);

    return NextResponse.json({
      userMessage,
      assistantMessage: updated,
    });
  } catch (err) {
    const elapsedMs = Date.now() - started;
    // Server-side diagnostics: never logs the API key or message content.
    console.error("[chat] AI generation failed", {
      conversationId: id,
      userId: user.id,
      elapsedMs,
      provider: aiProvider.describe(),
      ...(err instanceof AIProviderError
        ? err.toLog()
        : { kind: "unknown", message: err instanceof Error ? err.message : String(err) }),
    });

    // Roll back this turn so a reload doesn't show a stale "trouble responding"
    // bubble and the client can put the text back in the composer for a retry.
    await prisma.message
      .deleteMany({ where: { id: { in: [userMessage.id, assistantMessage.id] } } })
      .catch((e) => console.error("[chat] rollback failed", e));

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
