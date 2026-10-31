/**
 * Memory processing pipeline.
 *
 * Billing note: extraction is its own AI call. It is NEVER run inline per chat
 * turn — the chat route only records a pending job (a DB row, no AI), and the
 * worker runs extraction once per conversation burst after the user goes quiet
 * (see ./schedule.ts). A chat turn therefore costs exactly one provider call.
 */

import { prisma } from "@/lib/db";
import { extractFromMessages } from "./extract";
import { persistMemories } from "./store";
import { persistEvents } from "@/lib/life/events";
import { createFollowUpFromProposal } from "@/lib/proactive/follow-ups";
import { memorySchedule } from "./schedule";

/** When the conversation's memories were last extracted (null = never). */
export async function lastExtractionAt(conversationId: string): Promise<Date | null> {
  const last = await prisma.memoryProcessingJob.findFirst({
    where: { conversationId, status: "completed", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  return last?.completedAt ?? null;
}

/**
 * Extract memories, events, and follow-up proposals from the conversation's
 * messages since the last extraction (one AI call).
 * @param jobId an existing job row to update; otherwise one is created.
 */
export async function processConversationMemories(
  userId: string,
  conversationId: string,
  jobId?: string
): Promise<{
  memoriesStored: number;
  eventsStored: number;
  followUpsCreated: number;
}> {
  const since = await lastExtractionAt(conversationId);
  const job = jobId
    ? await prisma.memoryProcessingJob.update({ where: { id: jobId }, data: { status: "processing" } })
    : await prisma.memoryProcessingJob.create({
        data: { userId, conversationId, status: "processing" },
      });

  try {
    // Latest 40 messages since the last extraction (not the first 40 ever).
    const messages = (
      await prisma.message.findMany({
        where: {
          conversationId,
          role: { in: ["user", "assistant"] },
          ...(since ? { createdAt: { gt: since } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, role: true, content: true },
      })
    ).reverse();

    if (messages.length < 2 || !messages.some((m) => m.role === "user")) {
      await prisma.memoryProcessingJob.update({
        where: { id: job.id },
        data: { status: "completed", completedAt: new Date() },
      });
      return { memoriesStored: 0, eventsStored: 0, followUpsCreated: 0 };
    }

    const extraction = await extractFromMessages(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );

    const lastMessageId = messages[messages.length - 1]?.id ?? null;

    const storedMemories = await persistMemories(
      userId,
      conversationId,
      lastMessageId,
      extraction.memories
    );

    const storedEvents = await persistEvents(
      userId,
      conversationId,
      extraction.events
    );

    let followUpsCreated = 0;
    for (const proposal of extraction.followUpProposals) {
      const created = await createFollowUpFromProposal(userId, conversationId, proposal);
      if (created) followUpsCreated++;
    }

    await prisma.memoryProcessingJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date() },
    });

    return {
      memoriesStored: storedMemories.length,
      eventsStored: storedEvents.length,
      followUpsCreated,
    };
  } catch (err) {
    console.error("Memory processing failed", err);
    await prisma.memoryProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        lastErrorCode: err instanceof Error ? err.message.slice(0, 100) : "unknown",
      },
    });
    throw err;
  }
}

/**
 * Mark a conversation as needing memory extraction. No AI call here — just a
 * pending job row (deduplicated per conversation) for the worker to pick up
 * once the user goes quiet.
 */
export function enqueueMemoryProcessing(userId: string, conversationId: string): void {
  if (memorySchedule().mode === "off") return;
  (async () => {
    const existing = await prisma.memoryProcessingJob.findFirst({
      where: {
        conversationId,
        OR: [
          { status: "pending" },
          // A job stuck in "processing" (crashed worker) shouldn't block new ones forever.
          { status: "processing", createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
        ],
      },
      select: { id: true },
    });
    if (existing) return;
    await prisma.memoryProcessingJob.create({
      data: { userId, conversationId, status: "pending" },
    });
  })().catch((err) => {
    console.error("Could not queue memory processing", err);
  });
}
