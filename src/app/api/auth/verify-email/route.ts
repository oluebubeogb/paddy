import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  redeemChallengeByToken,
  redeemChallengeByPhrase,
} from "@/lib/auth/challenges";
import {
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

const schema = z.object({
  token: z.string().optional(),
  email: z.string().email().optional(),
  phrase: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { token, email, phrase } = parsed.data;

    let result;

    if (token) {
      result = await redeemChallengeByToken(token, "verify_email");
    } else if (email && phrase) {
      result = await redeemChallengeByPhrase(email, phrase, "verify_email");
    } else {
      return NextResponse.json(
        { error: "Token or email + phrase required" },
        { status: 400 }
      );
    }

    if (!result.success || !result.challenge) {
      const messages: Record<string, string> = {
        invalid_token: "This link is invalid or has expired.",
        invalid_phrase: "That phrase doesn't match. Please try again.",
        expired: "This little secret has expired. Let's send you a fresh one.",
        already_used: "This confirmation has already been used.",
        purpose_mismatch: "Invalid confirmation type.",
        too_many_attempts: "Too many attempts. Please request a new phrase.",
      };
      return NextResponse.json(
        { error: messages[result.reason || ""] || "Verification failed" },
        { status: 400 }
      );
    }

    const { email: challengeEmail, userId } = result.challenge;

    if (!userId) {
      return NextResponse.json(
        { error: "Account not found for this verification" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    const sessionToken = await createSession(userId, {
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await setSessionCookie(sessionToken);

    return NextResponse.json({
      ok: true,
      message: "You're all set. Welcome to Paddy! 💚",
    });
  } catch (err) {
    console.error("verify-email error", err);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
