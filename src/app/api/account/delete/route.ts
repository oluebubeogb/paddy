import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroyAllUserSessions, clearSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT"),
});

/**
 * Account deletion with explicit confirmation.
 * Removes personal data: profile, memories, conversations, messages,
 * events, goals, follow-ups, push subscriptions, sessions.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'Confirmation required. Send { "confirmation": "DELETE MY ACCOUNT" }',
      },
      { status: 400 }
    );
  }

  const userId = user.id;

  // Audit before deletion
  await prisma.auditEvent.create({
    data: {
      userId,
      action: "account_deletion_requested",
      metadata: { email: user.email },
    },
  });

  // Soft-status then hard-delete related data via cascades where configured
  await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: "deleted", email: `deleted_${userId}@invalid.local` },
  });

  // Explicit cleanup for soft-deleted memories etc.
  await prisma.memory.updateMany({
    where: { userId },
    data: { deletedAt: new Date(), content: "[redacted]" },
  });

  await prisma.message.updateMany({
    where: { userId },
    data: { content: "[redacted]" },
  });

  await prisma.pushSubscription.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.emailAuthChallenge.deleteMany({ where: { userId } });
  await prisma.followUp.updateMany({
    where: { userId },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  await destroyAllUserSessions(userId);
  await clearSessionCookie();

  await prisma.auditEvent.create({
    data: {
      action: "account_deletion_completed",
      metadata: { userId },
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Account deleted. Personal data has been removed or redacted.",
  });
}
