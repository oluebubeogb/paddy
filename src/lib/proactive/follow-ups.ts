/**
 * Follow-up scheduling and lifecycle.
 * Durable records in Postgres; Redis/BullMQ is the execution queue (Phase 2 worker).
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { FollowUpProposal } from "@/lib/memory/types";

function idempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create a follow-up from an extraction proposal, respecting user preferences.
 */
export async function createFollowUpFromProposal(
  userId: string,
  conversationId: string | null,
  proposal: FollowUpProposal
) {
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
  });

  if (!prefs?.proactiveEnabled) return null;

  if (proposal.type === "contextual" && !prefs.contextualFollowupsEnabled) {
    return null;
  }
  if (proposal.type === "spontaneous" && !prefs.spontaneousMessagesEnabled) {
    return null;
  }

  // Require reasonable confidence
  if (proposal.confidence < 0.6) return null;

  let scheduledAt: Date | null = null;
  if (proposal.suggestedAt) {
    const parsed = Date.parse(proposal.suggestedAt);
    if (!Number.isNaN(parsed)) {
      scheduledAt = new Date(parsed);
      // Don't schedule in the past
      if (scheduledAt.getTime() < Date.now()) scheduledAt = null;
    }
  }

  // Explicit user requests can be scheduled immediately when time is known
  // Contextual without a clear time stay as "proposed"
  const status =
    proposal.type === "explicit" && scheduledAt
      ? "scheduled"
      : scheduledAt
        ? "scheduled"
        : "proposed";

  const followUp = await prisma.followUp.create({
    data: {
      userId,
      conversationId,
      type: proposal.type,
      status,
      scheduledAt,
      messageIntent: proposal.messageIntent,
      idempotencyKey: idempotencyKey(),
    },
  });

  return followUp;
}

/**
 * Explicit user-requested follow-up (e.g. "remind me Wednesday at 4pm").
 */
export async function createExplicitFollowUp(
  userId: string,
  data: {
    scheduledAt: Date;
    messageIntent: string;
    conversationId?: string;
    eventId?: string;
    timezone?: string;
  }
) {
  return prisma.followUp.create({
    data: {
      userId,
      conversationId: data.conversationId,
      eventId: data.eventId,
      type: "explicit",
      status: "scheduled",
      scheduledAt: data.scheduledAt,
      timezone: data.timezone,
      messageIntent: data.messageIntent,
      idempotencyKey: idempotencyKey(),
    },
  });
}

export async function listFollowUps(userId: string, status?: string) {
  return prisma.followUp.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
      status: status
        ? status
        : { notIn: ["cancelled", "dismissed"] },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function dismissFollowUp(userId: string, followUpId: string) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { status: "dismissed", cancelledAt: new Date() },
  });
  return result.count > 0;
}

export async function cancelFollowUp(userId: string, followUpId: string) {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, userId },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Find due follow-ups ready for processing.
 * Worker calls this to rediscover work after restarts.
 */
export async function findDueFollowUps(limit = 20) {
  const now = new Date();
  return prisma.followUp.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    include: {
      user: {
        include: {
          profile: true,
          companionPreferences: true,
          notificationPreferences: true,
        },
      },
      event: true,
    },
  });
}

/**
 * Revalidate a follow-up before delivery.
 * Returns null if it should not be sent.
 */
export async function revalidateFollowUp(followUpId: string): Promise<{
  ok: boolean;
  reason?: string;
  followUp?: Awaited<ReturnType<typeof findDueFollowUps>>[0];
}> {
  const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
    include: {
      user: {
        include: {
          profile: true,
          companionPreferences: true,
          notificationPreferences: true,
        },
      },
      event: true,
    },
  });

  if (!followUp) return { ok: false, reason: "not_found" };
  if (followUp.status !== "scheduled" && followUp.status !== "processing") {
    return { ok: false, reason: "invalid_status" };
  }
  if (followUp.user.accountStatus !== "active") {
    return { ok: false, reason: "account_inactive" };
  }

  const prefs = followUp.user.notificationPreferences;
  if (!prefs?.proactiveEnabled) {
    return { ok: false, reason: "proactive_disabled" };
  }
  if (followUp.type === "contextual" && !prefs.contextualFollowupsEnabled) {
    return { ok: false, reason: "contextual_disabled" };
  }
  if (followUp.type === "spontaneous" && !prefs.spontaneousMessagesEnabled) {
    return { ok: false, reason: "spontaneous_disabled" };
  }

  // Quiet hours check
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    const tz = prefs.timezone || followUp.user.timezone || "UTC";
    if (isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, tz)) {
      return { ok: false, reason: "quiet_hours" };
    }
  }

  // Event still relevant?
  if (followUp.event && ["cancelled", "completed"].includes(followUp.event.status)) {
    return { ok: false, reason: "event_no_longer_relevant" };
  }

  // Daily spontaneous limit
  if (followUp.type === "spontaneous") {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const deliveredToday = await prisma.followUp.count({
      where: {
        userId: followUp.userId,
        type: "spontaneous",
        status: "delivered",
        deliveredAt: { gte: startOfDay },
      },
    });
    if (deliveredToday >= (prefs.dailySpontaneousLimit ?? 1)) {
      return { ok: false, reason: "daily_limit" };
    }
  }

  return { ok: true, followUp };
}

function isWithinQuietHours(
  start: string,
  end: string,
  _timezone: string
): boolean {
  // Simple UTC-based check for MVP; production should use proper TZ library
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);

  if (startMin <= endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
  // Overnight quiet hours (e.g. 22:00–07:00)
  return currentMinutes >= startMin || currentMinutes < endMin;
}

/**
 * Mark follow-up as processing (claim for worker).
 */
export async function claimFollowUp(followUpId: string): Promise<boolean> {
  const result = await prisma.followUp.updateMany({
    where: { id: followUpId, status: "scheduled" },
    data: {
      status: "processing",
      lastAttemptAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });
  return result.count > 0;
}

/**
 * Mark delivered and record the assistant message.
 */
export async function markFollowUpDelivered(
  followUpId: string,
  messageId: string
) {
  await prisma.followUp.update({
    where: { id: followUpId },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
    },
  });
  // messageId retained via conversation linkage
  void messageId;
}
