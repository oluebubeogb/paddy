/**
 * Life events and goals management.
 */

import { prisma } from "@/lib/db";
import type { ExtractedEvent } from "@/lib/memory/types";

export async function persistEvents(
  userId: string,
  conversationId: string | null,
  events: ExtractedEvent[]
) {
  const created = [];
  for (const e of events) {
    // Avoid inventing dates
    let eventAt: Date | null = null;
    if (e.date && !e.requiresClarification) {
      const parsed = Date.parse(e.date);
      if (!Number.isNaN(parsed)) eventAt = new Date(parsed);
    }

    // Dedup by title similarity for same user upcoming events
    const existing = await prisma.lifeEvent.findFirst({
      where: {
        userId,
        status: { in: ["upcoming", "ongoing"] },
        title: { equals: e.title, mode: "insensitive" },
      },
    });

    if (existing) {
      const updated = await prisma.lifeEvent.update({
        where: { id: existing.id },
        data: {
          description: e.description ?? existing.description,
          eventAt: eventAt ?? existing.eventAt,
          status: e.status,
        },
      });
      created.push(updated);
      continue;
    }

    const row = await prisma.lifeEvent.create({
      data: {
        userId,
        title: e.title,
        description: e.description ?? null,
        eventAt,
        timezone: e.timezone ?? null,
        status: e.status,
        sourceConversationId: conversationId,
        userConfirmed: !e.requiresClarification,
      },
    });
    created.push(row);
  }
  return created;
}

export async function listEvents(
  userId: string,
  status?: string
) {
  return prisma.lifeEvent.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
    },
    orderBy: [{ eventAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function updateEvent(
  userId: string,
  eventId: string,
  data: {
    title?: string;
    description?: string | null;
    eventAt?: Date | null;
    status?: string;
    userConfirmed?: boolean;
  }
) {
  const result = await prisma.lifeEvent.updateMany({
    where: { id: eventId, userId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.lifeEvent.findUnique({ where: { id: eventId } });
}

export async function deleteEvent(userId: string, eventId: string) {
  const result = await prisma.lifeEvent.deleteMany({
    where: { id: eventId, userId },
  });
  return result.count > 0;
}

// ── Goals ──

export async function listGoals(userId: string, status?: string) {
  return prisma.goal.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createGoal(
  userId: string,
  data: {
    title: string;
    description?: string;
    targetAt?: Date | null;
  }
) {
  return prisma.goal.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      targetAt: data.targetAt ?? null,
      status: "active",
    },
  });
}

export async function updateGoal(
  userId: string,
  goalId: string,
  data: {
    title?: string;
    description?: string | null;
    targetAt?: Date | null;
    status?: string;
    progressNotes?: string | null;
  }
) {
  const result = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.goal.findUnique({ where: { id: goalId } });
}

export async function deleteGoal(userId: string, goalId: string) {
  const result = await prisma.goal.deleteMany({
    where: { id: goalId, userId },
  });
  return result.count > 0;
}
