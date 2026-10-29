import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  challengeService,
  clearChallengeCookie,
  hashSecret,
  readChallengeCookie,
  REDEEM_MESSAGES,
} from "@/lib/auth/challenges";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { limitChallengeRedeem } from "@/lib/auth/issue";
import { clientIp } from "@/lib/rate-limit";

const schema = z.union([
  z.object({ token: z.string().min(1).max(200) }),
  z.object({ phrase: z.string().min(1).max(200) }),
]);

export async function POST(req: NextRequest) {
  try {
    const limited = limitChallengeRedeem(req);
    if (limited) return limited;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Token or phrase required" }, { status: 400 });
    }

    const handle = await readChallengeCookie("verify_email");
    const result =
      "token" in parsed.data
        ? await challengeService.redeemByToken(parsed.data.token, "verify_email")
        : await challengeService.redeemByPhrase(handle, parsed.data.phrase, "verify_email");

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

    const { userId, handleHash } = result.challenge;
    if (!userId) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    // Only sign in the browser that started the flow. A link opened on
    // another device (or by a mail scanner) verifies the email but does not
    // mint a session there.
    const sameBrowser = !!handle && hashSecret(handle) === handleHash;
    await clearChallengeCookie("verify_email");

    if (sameBrowser) {
      const sessionToken = await createSession(userId, {
        userAgent: req.headers.get("user-agent")?.slice(0, 256) ?? undefined,
        ipAddress: clientIp(req.headers),
      });
      await setSessionCookie(sessionToken);
      return NextResponse.json({
        ok: true,
        signedIn: true,
        message: "You're all set. Welcome to Paddy! 💚",
      });
    }

    return NextResponse.json({
      ok: true,
      signedIn: false,
      message: "You're all set. Sign in to say hi to Paddy 💚",
    });
  } catch (err) {
    console.error("verify-email error", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
