import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  redeemChallengeByToken,
  redeemChallengeByPhrase,
} from "@/lib/auth/challenges";
import { hashPassword } from "@/lib/auth/password";
import { destroyAllUserSessions } from "@/lib/auth/session";

const schema = z.object({
  token: z.string().optional(),
  email: z.string().email().optional(),
  phrase: z.string().optional(),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { token, email, phrase, newPassword } = parsed.data;

    let result;
    if (token) {
      result = await redeemChallengeByToken(token, "reset_password");
    } else if (email && phrase) {
      result = await redeemChallengeByPhrase(email, phrase, "reset_password");
    } else {
      return NextResponse.json(
        { error: "Token or email + phrase required" },
        { status: 400 }
      );
    }

    if (!result.success || !result.challenge) {
      return NextResponse.json(
        { error: "Invalid or expired reset link/phrase" },
        { status: 400 }
      );
    }

    const userId = result.challenge.userId;
    if (!userId) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate all existing sessions after password change
    await destroyAllUserSessions(userId);

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can sign in now.",
    });
  } catch (err) {
    console.error("reset-password error", err);
    return NextResponse.json(
      { error: "Unable to reset password" },
      { status: 500 }
    );
  }
}
