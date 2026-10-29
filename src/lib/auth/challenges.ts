/**
 * Email Auth Challenge Service
 * Implements Paddy's Secret Phrase natural-language authentication.
 * The phrase is UX only; security is provided by a high-entropy token.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { generateUniquePhrase } from "@/lib/phrase-generator";

export type ChallengePurpose =
  | "verify_email"
  | "reset_password"
  | "change_email"
  | "sensitive_action";

export interface CreateChallengeOptions {
  email: string;
  purpose: ChallengePurpose;
  userId?: string | null;
  expiresInMinutes?: number;
  requestMetadata?: Record<string, unknown>;
}

export interface ChallengeResult {
  challengeId: string;
  phrase: string;
  token: string; // plaintext token — only returned once for email construction
  expiresAt: Date;
}

const DEFAULT_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Create a new authentication challenge.
 * Invalidates previous unconsumed challenges of the same purpose + email.
 */
export async function createEmailChallenge(
  options: CreateChallengeOptions
): Promise<ChallengeResult> {
  const {
    email,
    purpose,
    userId = null,
    expiresInMinutes = DEFAULT_EXPIRY_MINUTES,
    requestMetadata,
  } = options;

  const normalizedEmail = email.toLowerCase().trim();
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const phrase = generateUniquePhrase();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // Invalidate previous unconsumed challenges for same email + purpose
  await prisma.emailAuthChallenge.updateMany({
    where: {
      email: normalizedEmail,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      consumedAt: new Date(), // mark as consumed/invalidated
    },
  });

  const challenge = await prisma.emailAuthChallenge.create({
    data: {
      email: normalizedEmail,
      purpose,
      tokenHash,
      phrase,
      expiresAt,
      userId: userId ?? undefined,
      requestMetadata: requestMetadata ?? undefined,
    },
  });

  return {
    challengeId: challenge.id,
    phrase,
    token,
    expiresAt,
  };
}

export interface RedeemResult {
  success: boolean;
  reason?: string;
  challenge?: {
    id: string;
    email: string;
    purpose: ChallengePurpose;
    userId: string | null;
  };
}

/**
 * Redeem a challenge by the secure token (used by verification links).
 */
export async function redeemChallengeByToken(
  token: string,
  expectedPurpose: ChallengePurpose
): Promise<RedeemResult> {
  const tokenHash = hashToken(token);

  const challenge = await prisma.emailAuthChallenge.findFirst({
    where: { tokenHash },
  });

  if (!challenge) {
    return { success: false, reason: "invalid_token" };
  }

  if (challenge.purpose !== expectedPurpose) {
    return { success: false, reason: "purpose_mismatch" };
  }

  if (challenge.consumedAt) {
    return { success: false, reason: "already_used" };
  }

  if (challenge.expiresAt < new Date()) {
    return { success: false, reason: "expired" };
  }

  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    return { success: false, reason: "too_many_attempts" };
  }

  // Atomic consume
  const updated = await prisma.emailAuthChallenge.updateMany({
    where: {
      id: challenge.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      consumedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return { success: false, reason: "already_used_or_expired" };
  }

  return {
    success: true,
    challenge: {
      id: challenge.id,
      email: challenge.email,
      purpose: challenge.purpose as ChallengePurpose,
      userId: challenge.userId,
    },
  };
}

/**
 * Redeem by phrase (manual copy-paste flow).
 * Still requires the phrase to be bound to a valid unexpired challenge.
 */
export async function redeemChallengeByPhrase(
  email: string,
  phrase: string,
  expectedPurpose: ChallengePurpose
): Promise<RedeemResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const trimmedPhrase = phrase.trim();

  const challenge = await prisma.emailAuthChallenge.findFirst({
    where: {
      email: normalizedEmail,
      purpose: expectedPurpose,
      phrase: trimmedPhrase,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    // Increment attempt count on any matching email+purpose if exists
    await prisma.emailAuthChallenge.updateMany({
      where: {
        email: normalizedEmail,
        purpose: expectedPurpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        attemptCount: { increment: 1 },
      },
    });
    return { success: false, reason: "invalid_phrase" };
  }

  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    return { success: false, reason: "too_many_attempts" };
  }

  const updated = await prisma.emailAuthChallenge.updateMany({
    where: {
      id: challenge.id,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return { success: false, reason: "already_used" };
  }

  return {
    success: true,
    challenge: {
      id: challenge.id,
      email: challenge.email,
      purpose: challenge.purpose as ChallengePurpose,
      userId: challenge.userId,
    },
  };
}

/**
 * Build the verification URL that embeds the secure token.
 */
export function buildVerificationUrl(
  baseUrl: string,
  purpose: ChallengePurpose,
  token: string
): string {
  const path =
    purpose === "reset_password"
      ? "/reset-password"
      : purpose === "verify_email"
        ? "/verify-email"
        : "/confirm";
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}
