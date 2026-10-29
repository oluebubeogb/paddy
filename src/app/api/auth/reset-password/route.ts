import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  challengeService,
  clearChallengeCookie,
  readChallengeCookie,
  REDEEM_MESSAGES,
} from "@/lib/auth/challenges";
import { hashPassword } from "@/lib/auth/password";
import { destroyAllUserSessions } from "@/lib/auth/session";
import { limitChallengeRedeem } from "@/lib/auth/issue";

const password = z.string().min(8).max(128);
const schema = z.union([
  z.object({ token: z.string().min(1).max(200), newPassword: password }),
  z.object({ phrase: z.string().min(1).max(200), newPassword: password }),
]);

export async function POST(req: NextRequest) {
  try {
    const limited = limitChallengeRedeem(req);
    if (limited) return limited;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter your secret phrase and a new password of at least 8 characters." },
        { status: 400 }
      );
    }

    const result =
      "token" in parsed.data
        ? await challengeService.redeemByToken(parsed.data.token, "reset_password")
        : await challengeService.redeemByPhrase(
            await readChallengeCookie("reset_password"),
            parsed.data.phrase,
            "reset_password"
          );

    if (!result.success) {
      return NextResponse.json(
        {
          error: REDEEM_MESSAGES[result.reason],
          reason: result.reason,
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: 400 }
      );
    }

    const userId = result.challenge.userId;
    if (!userId) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Redeeming an emailed challenge proves inbox ownership.
        ...(user && !user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      },
    });

    await destroyAllUserSessions(userId);
    await clearChallengeCookie("reset_password");

    return NextResponse.json({
      ok: true,
      message: "You're back in. Your new password is ready — sign in to continue 💚",
    });
  } catch (err) {
    console.error("reset-password error", err);
    return NextResponse.json({ error: "Unable to reset password" }, { status: 500 });
  }
}
