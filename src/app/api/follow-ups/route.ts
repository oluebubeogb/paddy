import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listFollowUps,
  createExplicitFollowUp,
} from "@/lib/proactive/follow-ups";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = new URL(req.url).searchParams.get("status") || undefined;
  const followUps = await listFollowUps(user.id, status);
  return NextResponse.json({ followUps });
}

const createSchema = z.object({
  scheduledAt: z.string().datetime(),
  messageIntent: z.string().min(1).max(500),
  conversationId: z.string().optional(),
  eventId: z.string().optional(),
  timezone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const followUp = await createExplicitFollowUp(user.id, {
    scheduledAt: new Date(parsed.data.scheduledAt),
    messageIntent: parsed.data.messageIntent,
    conversationId: parsed.data.conversationId,
    eventId: parsed.data.eventId,
    timezone: parsed.data.timezone,
  });

  return NextResponse.json({ followUp }, { status: 201 });
}
