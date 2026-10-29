import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createEmailChallenge, buildVerificationUrl } from "@/lib/auth/challenges";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    const { email, password, displayName } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing && existing.emailVerifiedAt) {
      // Do not reveal that the account exists in a way that helps enumeration
      // But for registration we can say "check your email" anyway
      return NextResponse.json({
        ok: true,
        message: "If this email is available, a confirmation has been sent.",
      });
    }

    const passwordHash = await hashPassword(password);

    let userId: string;

    if (existing) {
      // Unverified account — update password and name
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
      await prisma.userProfile.upsert({
        where: { userId: existing.id },
        create: {
          userId: existing.id,
          displayName,
          preferredName: displayName,
        },
        update: { displayName, preferredName: displayName },
      });
      userId = existing.id;
    } else {
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          profile: {
            create: {
              displayName,
              preferredName: displayName,
            },
          },
          companionPreferences: { create: {} },
          notificationPreferences: { create: {} },
        },
      });
      userId = user.id;
    }

    const challenge = await createEmailChallenge({
      email: normalizedEmail,
      purpose: "verify_email",
      userId,
    });

    // In development, log the phrase + link so testing is possible without email
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const verifyUrl = buildVerificationUrl(appUrl, "verify_email", challenge.token);

    if (process.env.NODE_ENV === "development") {
      console.log("────────────────────────────────────────");
      console.log("PADDY SECRET PHRASE (dev only)");
      console.log("Email:", normalizedEmail);
      console.log("Phrase:", challenge.phrase);
      console.log("Verify URL:", verifyUrl);
      console.log("────────────────────────────────────────");
    }

    // TODO: Phase 1 — integrate real email provider.
    // For now we always succeed and rely on the verification page + phrase entry
    // or the logged link in development.

    return NextResponse.json({
      ok: true,
      message: "Check your inbox for a little secret from Paddy.",
      // Dev helper only
      ...(process.env.NODE_ENV === "development"
        ? { devPhrase: challenge.phrase, devUrl: verifyUrl }
        : {}),
    });
  } catch (err) {
    console.error("sign-up error", err);
    return NextResponse.json(
      { error: "Unable to create account" },
      { status: 500 }
    );
  }
}
