/**
 * Paddy Secret Phrase — Prisma binding + Next.js helpers.
 * Business rules live in ./challenge-service.ts (unit-tested).
 */

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import {
  createChallengeService,
  generateSecret,
  type ChallengePurpose,
  type ChallengeRecord,
  type ChallengeRepo,
  type RequestMetadata,
} from "./challenge-service";

export * from "./challenge-service";

function toRecord(row: {
  id: string;
  userId: string | null;
  email: string;
  purpose: string;
  tokenHash: string;
  handleHash: string;
  phrase: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  createdAt: Date;
}): ChallengeRecord {
  return { ...row, purpose: row.purpose as ChallengePurpose };
}

export const prismaChallengeRepo: ChallengeRepo = {
  async invalidateActive(email, purpose, now) {
    const res = await prisma.emailAuthChallenge.updateMany({
      where: { email, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    return res.count;
  },
  async insert(data) {
    const row = await prisma.emailAuthChallenge.create({
      data: {
        userId: data.userId,
        email: data.email,
        purpose: data.purpose,
        tokenHash: data.tokenHash,
        handleHash: data.handleHash,
        phrase: data.phrase,
        expiresAt: data.expiresAt,
        requestMetadata: (data.requestMetadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    return toRecord(row);
  },
  async findByTokenHash(tokenHash) {
    const row = await prisma.emailAuthChallenge.findUnique({ where: { tokenHash } });
    return row ? toRecord(row) : null;
  },
  async findByHandleHash(handleHash) {
    const row = await prisma.emailAuthChallenge.findUnique({ where: { handleHash } });
    return row ? toRecord(row) : null;
  },
  async incrementAttempts(id) {
    const row = await prisma.emailAuthChallenge.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
      select: { attemptCount: true },
    });
    return row.attemptCount;
  },
  async consumeIfActive(id, now, maxAttempts) {
    const res = await prisma.emailAuthChallenge.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: maxAttempts },
      },
      data: { consumedAt: now },
    });
    return res.count === 1;
  },
  async deleteExpired(before) {
    const res = await prisma.emailAuthChallenge.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return res.count;
  },
};

export const challengeService = createChallengeService(prismaChallengeRepo);

// ── Browser handle cookie ────────────────────────────────────────────────────

const COOKIE_PREFIX = "paddy_ch_";

function cookieName(purpose: ChallengePurpose) {
  return `${COOKIE_PREFIX}${purpose}`;
}

export async function setChallengeCookie(
  purpose: ChallengePurpose,
  handle: string,
  maxAgeSeconds = challengeService.expiryMinutes * 60
) {
  const store = await cookies();
  store.set(cookieName(purpose), handle, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: maxAgeSeconds,
  });
}

/**
 * Set an indistinguishable decoy cookie when no challenge was issued
 * (unknown email etc.) so responses don't reveal account existence.
 */
export async function setDecoyChallengeCookie(purpose: ChallengePurpose) {
  await setChallengeCookie(purpose, generateSecret());
}

export async function readChallengeCookie(purpose: ChallengePurpose) {
  const store = await cookies();
  return store.get(cookieName(purpose))?.value;
}

export async function clearChallengeCookie(purpose: ChallengePurpose) {
  const store = await cookies();
  store.set(cookieName(purpose), "", { path: "/api/auth", maxAge: 0 });
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

export function requestMetadata(req: NextRequest): RequestMetadata {
  return {
    ip: clientIp(req.headers),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256) || undefined,
  };
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Build the Method A link. Only purposes with a shipped UI are supported;
 * change_email / sensitive_action intentionally throw until their flows exist
 * (no dangling /confirm links).
 */
export function buildVerificationUrl(
  baseUrl: string,
  purpose: ChallengePurpose,
  token: string
): string {
  const base = baseUrl.replace(/\/+$/, "");
  switch (purpose) {
    case "verify_email":
      return `${base}/verify-email?token=${encodeURIComponent(token)}`;
    case "reset_password":
      return `${base}/reset-password?token=${encodeURIComponent(token)}`;
    default:
      // TODO(blueprint §5): change_email + sensitive_action flows.
      throw new Error(`No confirmation flow implemented for purpose "${purpose}"`);
  }
}

/** Copy-page link. Token is in the #fragment so it never hits logs/referrers. */
export function buildPhraseCopyUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/phrase#${token}`;
}
