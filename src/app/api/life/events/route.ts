import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listEvents,
  persistEvents,
} from "@/lib/life/events";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = new URL(req.url).searchParams.get("status") || undefined;
  const events = await listEvents(user.id, status);
  return NextResponse.json({ events });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  eventAt: z.string().datetime().optional().nullable(),
  timezone: z.string().optional(),
  status: z.enum(["upcoming", "ongoing", "completed", "cancelled"]).optional(),
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

  const events = await persistEvents(user.id, null, [
    {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      date: parsed.data.eventAt ?? null,
      timezone: parsed.data.timezone ?? null,
      status: parsed.data.status ?? "upcoming",
      requiresClarification: false,
    },
  ]);

  return NextResponse.json({ event: events[0] }, { status: 201 });
}
