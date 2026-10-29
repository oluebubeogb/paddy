import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/challenges";
import { issueChallenge, issueDecoy, limitChallengeCreate } from "@/lib/auth/issue";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
});

const GENERIC = {
  ok: true,
  message: "Check your inbox — Paddy sent you a little secret 💚",
};

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { password, displayName } = parsed.data;
    const email = normalizeEmail(parsed.data.email);

    const limited = limitChallengeCreate(req, email, "verify_email");
    if (limited) return limited;

    const existing = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (existing) {
      // Never overwrite an existing account (verified or not) from sign-up:
      // that would let anyone take over a pending registration.
      if (!existing.emailVerifiedAt) {
        // Re-send verification to the real owner of the inbox. The original
        // password stays; a forgotten one can be reset via /forgot-password.
        try {
          const extras = await issueChallenge(req, {
            email,
            purpose: "verify_email",
            userId: existing.id,
            name: existing.profile?.preferredName ?? existing.profile?.displayName,
          });
          return NextResponse.json({ ...GENERIC, ...extras });
        } catch (err) {
          console.error("sign-up resend failed", err);
          return NextResponse.json(GENERIC);
        }
      }
      // Verified: same response, no email. (TODO: optional "you already have
      // an account" notice email.)
      await issueDecoy("verify_email");
      return NextResponse.json(GENERIC);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: { create: { displayName, preferredName: displayName } },
        companionPreferences: { create: {} },
        notificationPreferences: { create: {} },
      },
    });

    try {
      const extras = await issueChallenge(req, {
        email,
        purpose: "verify_email",
        userId: user.id,
        name: displayName,
      });
      return NextResponse.json({ ...GENERIC, ...extras });
    } catch (err) {
      console.error("sign-up email send failed", err);
      return NextResponse.json(
        {
          error:
            "Your account was created, but we couldn't send the email just now. Please try “Send a fresh one” in a minute.",
          canResend: true,
        },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("sign-up error", err);
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
  }
}
