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
import { processConversationMemories } from "@/lib/memory/process";

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

async function processPendingMemoryJobs() {
  const jobs = await prisma.memoryProcessingJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: MAX_MEMORY_JOBS_PER_TICK,
  });

  for (const job of jobs) {
    if (shuttingDown) break;
    try {
      // Mark processing to avoid double-pickup
      await prisma.memoryProcessingJob.update({
        where: { id: job.id },
        data: { status: "processing", attemptCount: { increment: 1 } },
      });
      // processConversationMemories creates its own job record;
      // for pending external jobs we process the conversation directly
      const result = await processConversationMemories(
        job.userId,
        job.conversationId
      );
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
