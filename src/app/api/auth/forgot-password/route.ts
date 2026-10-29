import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createEmailChallenge,
  buildVerificationUrl,
} from "@/lib/auth/challenges";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const normalizedEmail = parsed.data.email.toLowerCase().trim();

    // Always return the same response to avoid account enumeration
    const genericResponse = {
      ok: true,
      message:
        "If an account exists for this email, we've sent a secure reset link.",
    };

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.emailVerifiedAt) {
      return NextResponse.json(genericResponse);
    }

    const challenge = await createEmailChallenge({
      email: normalizedEmail,
      purpose: "reset_password",
      userId: user.id,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const resetUrl = buildVerificationUrl(
      appUrl,
      "reset_password",
      challenge.token
    );

    if (process.env.NODE_ENV === "development") {
      console.log("────────────────────────────────────────");
      console.log("PADDY PASSWORD RESET (dev only)");
      console.log("Email:", normalizedEmail);
      console.log("Phrase:", challenge.phrase);
      console.log("Reset URL:", resetUrl);
      console.log("────────────────────────────────────────");
    }

    // TODO: send real email with phrase + link

    return NextResponse.json({
      ...genericResponse,
      ...(process.env.NODE_ENV === "development"
        ? { devPhrase: challenge.phrase, devUrl: resetUrl }
        : {}),
    });
  } catch (err) {
    console.error("forgot-password error", err);
    return NextResponse.json(
      { error: "Unable to process request" },
      { status: 500 }
    );
  }
}
