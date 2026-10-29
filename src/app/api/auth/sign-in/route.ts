import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "Please verify your email first. Check your inbox for the secret phrase.",
          needsVerification: true,
        },
        { status: 403 }
      );
    }

    if (user.accountStatus !== "active") {
      return NextResponse.json(
        { error: "Account is not active" },
        { status: 403 }
      );
    }

    const token = await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await setSessionCookie(token);

    const needsOnboarding = !user.profile?.preferredName;

    return NextResponse.json({
      ok: true,
      needsOnboarding,
    });
  } catch (err) {
    console.error("sign-in error", err);
    return NextResponse.json(
      { error: "Unable to sign in" },
      { status: 500 }
    );
  }
}
