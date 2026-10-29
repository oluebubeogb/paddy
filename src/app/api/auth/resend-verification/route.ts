import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/challenges";
import { issueChallenge, issueDecoy, limitChallengeCreate } from "@/lib/auth/issue";

const schema = z.object({ email: z.string().email().max(254) });

const GENERIC = {
  ok: true,
  message: "If that email is waiting to be confirmed, a fresh little secret is on its way 💚",
};

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const email = normalizeEmail(parsed.data.email);

    const limited = limitChallengeCreate(req, email, "verify_email");
    if (limited) return limited;

    const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
    if (!user || user.emailVerifiedAt) {
      await issueDecoy("verify_email");
      return NextResponse.json(GENERIC);
    }

    try {
      const extras = await issueChallenge(req, {
        email,
        purpose: "verify_email",
        userId: user.id,
        name: user.profile?.preferredName ?? user.profile?.displayName,
      });
      return NextResponse.json({ ...GENERIC, ...extras });
    } catch (err) {
      console.error("resend-verification send failed", err);
      return NextResponse.json(GENERIC);
    }
  } catch (err) {
    console.error("resend-verification error", err);
    return NextResponse.json({ error: "Unable to process request" }, { status: 500 });
  }
}
