import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listGoals, createGoal } from "@/lib/life/events";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = new URL(req.url).searchParams.get("status") || undefined;
  const goals = await listGoals(user.id, status);
  return NextResponse.json({ goals });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  targetAt: z.string().datetime().optional().nullable(),
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

  const goal = await createGoal(user.id, {
    title: parsed.data.title,
    description: parsed.data.description,
    targetAt: parsed.data.targetAt
      ? new Date(parsed.data.targetAt)
      : null,
  });

  return NextResponse.json({ goal }, { status: 201 });
}
