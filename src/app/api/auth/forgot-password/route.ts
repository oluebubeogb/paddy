import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/challenges";
import { issueChallenge, issueDecoy, limitChallengeCreate } from "@/lib/auth/issue";

const schema = z.object({ email: z.string().email().max(254) });

// Same response whether or not the account exists (no enumeration).
const GENERIC = {
  ok: true,
  message: "Let's get you back in. If that email has a Paddy account, a little secret is on its way 💚",
};

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const email = normalizeEmail(parsed.data.email);

    const limited = limitChallengeCreate(req, email, "reset_password");
    if (limited) return limited;

    const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });

    // Unverified accounts may reset too (proving inbox ownership verifies them).
    if (!user || user.accountStatus !== "active") {
      await issueDecoy("reset_password");
      return NextResponse.json(GENERIC);
    }

    try {
      const extras = await issueChallenge(req, {
        email,
        purpose: "reset_password",
        userId: user.id,
        name: user.profile?.preferredName ?? user.profile?.displayName,
      });
      return NextResponse.json({ ...GENERIC, ...extras });
    } catch (err) {
      // Logged for ops; response stays generic to avoid enumeration.
      console.error("forgot-password send failed", err);
      return NextResponse.json(GENERIC);
    }
  } catch (err) {
    console.error("forgot-password error", err);
    return NextResponse.json({ error: "Unable to process request" }, { status: 500 });
  }
}
