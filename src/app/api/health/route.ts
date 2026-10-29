import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Health check for load balancers and monitoring.
 * Does not expose secrets or internal details.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error" | "skipped"> = {
    app: "ok",
    database: "skipped",
    ai: process.env.AI_API_KEY ? "ok" : "skipped",
    push: process.env.VAPID_PUBLIC_KEY ? "ok" : "skipped",
  };

  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
    dbOk = true;
  } catch {
    checks.database = "error";
  }

  const healthy = checks.app === "ok" && checks.database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
