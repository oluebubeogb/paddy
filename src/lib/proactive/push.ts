/**
 * Web Push delivery for Paddy proactive messages.
 * Uses the web-push library with VAPID keys.
 */

import { prisma } from "@/lib/db";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Check whether Web Push is configured.
 */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

/**
 * Send a push notification to all active subscriptions for a user.
 * Returns delivery results without throwing on individual failures.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!isPushConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  // Dynamic import so the app can boot without web-push installed in constrained envs
  let webpush: typeof import("web-push");
  try {
    webpush = await import("web-push");
  } catch {
    console.warn("web-push package not available");
    return { sent: 0, failed: 0, skipped: true };
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, disabledAt: null },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const keys = JSON.parse(sub.encryptedSubscriptionKeys) as {
        p256dh: string;
        auth: string;
      };

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url || "/chat",
          tag: payload.tag || "paddy-proactive",
        }),
        {
          TTL: 60 * 60, // 1 hour
          urgency: "normal",
        }
      );

      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSuccessfulDeliveryAt: new Date() },
      });
      sent++;
    } catch (err: unknown) {
      failed++;
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 0;

      // Gone / expired subscription
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { disabledAt: new Date() },
        });
      }
      console.warn(`Push delivery failed for sub ${sub.id}:`, statusCode || err);
    }
  }

  return { sent, failed, skipped: false };
}

/**
 * Persist a new push subscription for the user.
 * Deduplicates by endpoint.
 */
export async function savePushSubscription(
  userId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
) {
  const existing = await prisma.pushSubscription.findFirst({
    where: { userId, endpoint: subscription.endpoint },
  });

  if (existing) {
    return prisma.pushSubscription.update({
      where: { id: existing.id },
      data: {
        encryptedSubscriptionKeys: JSON.stringify(subscription.keys),
        disabledAt: null,
      },
    });
  }

  return prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: subscription.endpoint,
      encryptedSubscriptionKeys: JSON.stringify(subscription.keys),
    },
  });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
) {
  const result = await prisma.pushSubscription.updateMany({
    where: { userId, endpoint },
    data: { disabledAt: new Date() },
  });
  return result.count > 0;
}
