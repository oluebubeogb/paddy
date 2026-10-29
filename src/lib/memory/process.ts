/**
 * Memory processing pipeline.
 * Runs after conversation checkpoints — does not block chat responses.
 */

import { prisma } from "@/lib/db";
import { extractFromMessages } from "./extract";
import { persistMemories } from "./store";
import { persistEvents } from "@/lib/life/events";
import { createFollowUpFromProposal } from "@/lib/proactive/follow-ups";

/**
 * Process a conversation for memories, events, and follow-up proposals.
 * Creates a durable job record so work is not lost.
 */
export async function processConversationMemories(
  userId: string,
  conversationId: string
): Promise<{
  memoriesStored: number;
  eventsStored: number;
  followUpsCreated: number;
}> {
  // Create or reuse a processing job record
  const job = await prisma.memoryProcessingJob.create({
    data: {
      userId,
      conversationId,
      status: "processing",
    },
  });

  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { id: true, role: true, content: true },
    });

    if (messages.length < 2) {
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
 * Enqueue memory processing without blocking the request.
 * In Phase 2 without Redis yet, runs fire-and-forget; worker will pick up pending jobs.
 */
export function enqueueMemoryProcessing(
  userId: string,
  conversationId: string
): void {
  // Fire-and-forget; errors logged inside
  processConversationMemories(userId, conversationId).catch((err) => {
    console.error("Background memory processing error", err);
  });
}
