import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Export user personal data as JSON (privacy / portability).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    profile,
    preferences,
    notificationPrefs,
    conversations,
    memories,
    events,
    goals,
    followUps,
  ] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id } }),
    prisma.companionPreferences.findUnique({ where: { userId: user.id } }),
    prisma.notificationPreferences.findUnique({ where: { userId: user.id } }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      include: {
        messages: {
          select: {
            role: true,
            content: true,
            origin: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.memory.findMany({
      where: { userId: user.id, deletedAt: null },
      select: {
        category: true,
        content: true,
        confidence: true,
        createdAt: true,
      },
    }),
    prisma.lifeEvent.findMany({ where: { userId: user.id } }),
    prisma.goal.findMany({ where: { userId: user.id } }),
    prisma.followUp.findMany({
      where: { userId: user.id },
      select: {
        type: true,
        status: true,
        scheduledAt: true,
        messageIntent: true,
        createdAt: true,
      },
    }),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      timezone: user.timezone,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
    },
    profile,
    companionPreferences: preferences,
    notificationPreferences: notificationPrefs,
    conversations,
    memories,
    lifeEvents: events,
    goals,
    followUps,
  };

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Disposition": `attachment; filename="paddy-export-${user.id}.json"`,
    },
  });
}
