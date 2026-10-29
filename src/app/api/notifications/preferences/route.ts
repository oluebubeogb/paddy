import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json({
    preferences: prefs || {
      proactiveEnabled: false,
      contextualFollowupsEnabled: true,
      spontaneousMessagesEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: user.timezone || "UTC",
      dailySpontaneousLimit: 1,
      notificationPreviewMode: "generic",
    },
  });
}

const patchSchema = z.object({
  proactiveEnabled: z.boolean().optional(),
  contextualFollowupsEnabled: z.boolean().optional(),
  spontaneousMessagesEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timezone: z.string().optional(),
  dailySpontaneousLimit: z.number().int().min(0).max(10).optional(),
  notificationPreviewMode: z.enum(["generic", "detailed"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...parsed.data,
    },
    update: parsed.data,
  });

  return NextResponse.json({ preferences: prefs });
}
