/**
 * Paddy background worker.
 * Processes due follow-ups and pending memory jobs.
 *
 * Run: npm run worker
 * (or: npx tsx src/worker/index.ts)
 *
 * For production: separate process from the same codebase (Docker service).
 * Redis/BullMQ can be layered on top; this worker rediscovers work from Postgres
 * so jobs survive restarts.
 */

import { prisma } from "@/lib/db";
import { findDueFollowUps } from "@/lib/proactive/follow-ups";
import { processFollowUp } from "@/lib/proactive/deliver";
import { lastExtractionAt, processConversationMemories } from "@/lib/memory/process";
import { memoryDecision, memorySchedule } from "@/lib/memory/schedule";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS || 15_000);
const MAX_FOLLOW_UPS_PER_TICK = 10;
const MAX_MEMORY_JOBS_PER_TICK = 5;

let shuttingDown = false;

async function processDueFollowUps() {
  const due = await findDueFollowUps(MAX_FOLLOW_UPS_PER_TICK);
  for (const fu of due) {
    if (shuttingDown) break;
    try {
      const result = await processFollowUp(fu.id);
      console.log(
        `[worker] follow-up ${fu.id}: ${result.success ? "delivered" : result.reason}`
      );
    } catch (err) {
      console.error(`[worker] follow-up ${fu.id} error`, err);
      await prisma.followUp.updateMany({
        where: { id: fu.id, status: "processing" },
        data: {
          status: "scheduled", // release for retry
          attemptCount: { increment: 0 },
        },
      });
    }
  }
}

/**
 * Memory extraction is one AI call per conversation *burst*, not per chat turn:
 * a pending job waits until the conversation has been quiet for MEMORY_IDLE_MINUTES
 * and has enough new user messages (see lib/memory/schedule.ts).
 */
async function processPendingMemoryJobs() {
  const schedule = memorySchedule();
  const now = Date.now();
  const jobs = await prisma.memoryProcessingJob.findMany({
    where: {
      status: "pending",
      ...(schedule.mode === "off"
        ? {}
        : { conversation: { lastMessageAt: { lt: new Date(now - schedule.idleMs) } } }),
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MEMORY_JOBS_PER_TICK,
    include: { conversation: { select: { lastMessageAt: true } } },
  });

  for (const job of jobs) {
    if (shuttingDown) break;
    try {
      const since = await lastExtractionAt(job.conversationId);
      const newUserMessages = await prisma.message.count({
        where: {
          conversationId: job.conversationId,
          role: "user",
          ...(since ? { createdAt: { gt: since } } : {}),
        },
      });
      const quietForMs = now - (job.conversation.lastMessageAt?.getTime() ?? job.createdAt.getTime());
      const decision = memoryDecision({ quietForMs, newUserMessages }, schedule);
      if (decision === "wait") continue;
      if (decision === "skip") {
        await prisma.memoryProcessingJob.update({
          where: { id: job.id },
          data: { status: "skipped", completedAt: new Date() },
        });
        continue;
      }

      // Claim atomically to avoid double pickup by a second worker.
      const claimed = await prisma.memoryProcessingJob.updateMany({
        where: { id: job.id, status: "pending" },
        data: { status: "processing", attemptCount: { increment: 1 } },
      });
      if (!claimed.count) continue;

      const result = await processConversationMemories(job.userId, job.conversationId, job.id);
      console.log(
        `[worker] memory job ${job.id}: ${result.memoriesStored} memories, ${result.eventsStored} events`
      );
    } catch (err) {
      console.error(`[worker] memory job ${job.id} error`, err);
      await prisma.memoryProcessingJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastErrorCode:
            err instanceof Error ? err.message.slice(0, 100) : "unknown",
        },
      });
    }
  }
}

const CHALLENGE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000; // keep 1 day past expiry for audit
let lastChallengeCleanup = 0;

/** Delete auth challenges that expired more than a day ago. */
async function cleanupExpiredChallenges() {
  const now = Date.now();
  if (now - lastChallengeCleanup < CHALLENGE_CLEANUP_INTERVAL_MS) return;
  lastChallengeCleanup = now;
  const res = await prisma.emailAuthChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now - CHALLENGE_RETENTION_MS) } },
  });
  if (res.count > 0) console.log(`[worker] purged ${res.count} expired auth challenges`);
}

async function tick() {
  if (shuttingDown) return;
  try {
    await processDueFollowUps();
    await processPendingMemoryJobs();
    await cleanupExpiredChallenges();
  } catch (err) {
    console.error("[worker] tick error", err);
  }
}

async function main() {
  console.log("[worker] Paddy worker starting");
  console.log(`[worker] poll interval: ${POLL_INTERVAL_MS}ms`);

  // Validate env
  if (!process.env.DATABASE_URL) {
    console.error("[worker] DATABASE_URL is required");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down…`);
    shuttingDown = true;
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Initial tick then interval
  await tick();
  const timer = setInterval(tick, POLL_INTERVAL_MS);

  // Keep alive
  process.on("beforeExit", () => clearInterval(timer));
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
