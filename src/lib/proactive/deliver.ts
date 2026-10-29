/**
 * Generate and deliver a proactive follow-up message.
 */

import { prisma } from "@/lib/db";
import { aiProvider } from "@/lib/ai/provider";
import {
  revalidateFollowUp,
  claimFollowUp,
  markFollowUpDelivered,
} from "./follow-ups";

/**
 * Process a single due follow-up end-to-end.
 * Idempotent: safe to retry.
 */
export async function processFollowUp(followUpId: string): Promise<{
  success: boolean;
  reason?: string;
}> {
  const validation = await revalidateFollowUp(followUpId);
  if (!validation.ok || !validation.followUp) {
    // Reschedule if quiet hours
    if (validation.reason === "quiet_hours") {
      await rescheduleAfterQuietHours(followUpId);
      return { success: false, reason: "quiet_hours_rescheduled" };
    }
    // Cancel permanently for other rejection reasons
    if (
      validation.reason &&
      ["proactive_disabled", "event_no_longer_relevant", "account_inactive"].includes(
        validation.reason
      )
    ) {
      await prisma.followUp.updateMany({
        where: { id: followUpId },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
    }
    return { success: false, reason: validation.reason };
  }

  const claimed = await claimFollowUp(followUpId);
  if (!claimed) {
    return { success: false, reason: "already_claimed" };
  }

  const followUp = validation.followUp;
  const user = followUp.user;

  // Ensure a conversation exists for the message
  let conversationId = followUp.conversationId;
  if (!conversationId) {
    const conv = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: "Check-in from Paddy",
        lastMessageAt: new Date(),
      },
    });
    conversationId = conv.id;
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { conversationId },
    });
  }

  // Generate a brief natural message
  const preferredName =
    user.profile?.preferredName || user.profile?.displayName || "there";
  const intent = followUp.messageIntent || "checking in";
  const eventContext = followUp.event
    ? `Related event: ${followUp.event.title}${
        followUp.event.eventAt
          ? ` (${followUp.event.eventAt.toISOString().slice(0, 10)})`
          : ""
      }`
    : "";

  let content: string;
  try {
    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content: `You are Paddy, a warm personal AI companion. Write a brief, natural proactive check-in message (1-2 sentences max). Address the user as ${preferredName} if natural. Do not use guilt or pressure. Be genuine and concise.`,
        },
        {
          role: "user",
          content: `Write a short check-in message.\nIntent: ${intent}\n${eventContext}\nRelationship style: ${
            user.companionPreferences?.relationshipStyle || "friend"
          }`,
        },
      ],
      temperature: 0.7,
      maxTokens: 120,
    });
    content = result.content.trim() || `Hey ${preferredName}! Just checking in 💚`;
  } catch (err) {
    console.error("Proactive message generation failed", err);
    // Preserve the scheduled record for retry
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { status: "scheduled" }, // release claim for retry
    });
    return { success: false, reason: "ai_unavailable" };
  }

  // Persist as assistant message
  const message = await prisma.message.create({
    data: {
      conversationId,
      userId: user.id,
      role: "assistant",
      content,
      origin: "proactive",
      generationStatus: "completed",
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  await markFollowUpDelivered(followUpId, message.id);

  // In-app delivery record
  await prisma.notificationDelivery.create({
    data: {
      followUpId,
      userId: user.id,
      channel: "in_app",
      status: "sent",
      attemptCount: 1,
      attemptedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Web Push (best-effort; never fails the overall delivery)
  try {
    const { sendPushToUser } = await import("./push");
    const previewMode =
      user.notificationPreferences?.notificationPreviewMode || "generic";
    const pushBody =
      previewMode === "detailed"
        ? content.slice(0, 120)
        : "Paddy has a message for you";

    const pushResult = await sendPushToUser(user.id, {
      title: "Paddy",
      body: pushBody,
      url: `/chat`,
      tag: `followup-${followUpId}`,
    });

    if (!pushResult.skipped) {
      await prisma.notificationDelivery.create({
        data: {
          followUpId,
          userId: user.id,
          channel: "web_push",
          status: pushResult.sent > 0 ? "sent" : "failed",
          attemptCount: 1,
          attemptedAt: new Date(),
          completedAt: new Date(),
          providerResponseCode:
            pushResult.sent > 0
              ? `sent:${pushResult.sent}`
              : `failed:${pushResult.failed}`,
        },
      });
    }
  } catch (pushErr) {
    console.warn("Push notification skipped", pushErr);
  }

  return { success: true };
}

async function rescheduleAfterQuietHours(followUpId: string) {
  // Push 1 hour forward as simple MVP reschedule
  const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
  });
  if (!followUp?.scheduledAt) return;

  const next = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.followUp.update({
    where: { id: followUpId },
    data: { scheduledAt: next },
  });
}
