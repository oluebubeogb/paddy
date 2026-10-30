import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { eligibilityFor, toIsoDate, validateDob } from "@/lib/user/age";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // Clear a stale/invalid session cookie so the proxy doesn't bounce
    // between /sign-in and /chat.
    await clearSessionCookie();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    timezone: user.timezone,
    preferredLanguage: user.preferredLanguage,
    dateOfBirth: toIsoDate(user.dateOfBirth),
    ageEligibilityStatus: user.ageEligibilityStatus ?? "unknown",
    dobPromptedAt: user.dobPromptedAt,
    profile: user.profile,
    companionPreferences: user.companionPreferences,
    notificationPreferences: user.notificationPreferences,
  });
}

const patchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  preferredName: z.string().min(1).max(80).optional(),
  timezone: z.string().optional(),
  relationshipStyle: z
    .enum(["friend", "best_friend", "romantic", "develop_naturally"])
    .optional(),
  proactiveEnabled: z.boolean().optional(),
  personalIntroduction: z.string().max(500).optional(),
  /** "YYYY-MM-DD" from the Paddy date picker. */
  dateOfBirth: z.string().max(10).optional(),
  /** User tapped "Not now" on the birthday prompt. */
  dobSkipped: z.literal(true).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  let eligibility = user.ageEligibilityStatus ?? "unknown";
  if (data.dateOfBirth !== undefined && user.dateOfBirth && toIsoDate(user.dateOfBirth) !== data.dateOfBirth) {
    // Set once — otherwise the age gate would be trivially bypassable.
    return NextResponse.json(
      { error: "Your birthday is already set. Contact support to change it." },
      { status: 409 }
    );
  }
  if (data.dateOfBirth !== undefined) {
    const checked = validateDob(data.dateOfBirth);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    eligibility = eligibilityFor(checked.date);
    await prisma.user.update({
      where: { id: user.id },
      data: { dateOfBirth: checked.date, ageEligibilityStatus: eligibility, dobPromptedAt: new Date() },
    });
    if (eligibility !== "verified_adult") {
      // Romantic & flirting are for verified adults only (blueprint §4).
      await prisma.companionPreferences.updateMany({
        where: { userId: user.id, relationshipStyle: "romantic" },
        data: { relationshipStyle: "friend" },
      });
      await prisma.companionPreferences.updateMany({
        where: { userId: user.id },
        data: { flirtingEnabled: false },
      });
    }
  } else if (data.dobSkipped) {
    await prisma.user.update({ where: { id: user.id }, data: { dobPromptedAt: new Date() } });
  }

  const alreadyRomantic =
    eligibility !== "underage" && user.companionPreferences?.relationshipStyle === "romantic";
  if (data.relationshipStyle === "romantic" && eligibility !== "verified_adult" && !alreadyRomantic) {
    return NextResponse.json(
      { error: "Add your birthday to unlock romantic — it's for adults only." },
      { status: 403 }
    );
  }

  if (data.displayName || data.preferredName || data.personalIntroduction) {
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: data.displayName || "User",
        preferredName: data.preferredName,
        personalIntroduction: data.personalIntroduction,
      },
      update: {
        ...(data.displayName && { displayName: data.displayName }),
        ...(data.preferredName && { preferredName: data.preferredName }),
        ...(data.personalIntroduction !== undefined && {
          personalIntroduction: data.personalIntroduction,
        }),
      },
    });
  }

  if (data.timezone) {
    await prisma.user.update({
      where: { id: user.id },
      data: { timezone: data.timezone },
    });
  }

  if (data.relationshipStyle) {
    await prisma.companionPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        relationshipStyle: data.relationshipStyle,
      },
      update: { relationshipStyle: data.relationshipStyle },
    });
  }

  if (data.proactiveEnabled !== undefined) {
    await prisma.notificationPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        proactiveEnabled: data.proactiveEnabled,
      },
      update: { proactiveEnabled: data.proactiveEnabled },
    });
  }

  return NextResponse.json({ ok: true, ageEligibilityStatus: eligibility });
}
