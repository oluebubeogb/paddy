import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const q = url.searchParams.get("q") || undefined;

  const memories = await prisma.memory.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(category ? { category } : {}),
      ...(q
        ? { content: { contains: q, mode: "insensitive" } }
        : {}),
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      category: true,
      content: true,
      confidence: true,
      importance: true,
      sensitivity: true,
      createdAt: true,
      lastConfirmedAt: true,
      sourceConversationId: true,
    },
  });

  return NextResponse.json({ memories });
}

export async function POST() {
  // Clear endpoint uses POST /api/memories/clear — keep this for future create
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
