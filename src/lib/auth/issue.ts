import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimitAll, clientIp } from "@/lib/rate-limit";
import { sendChallengeEmail, emailProvider } from "@/lib/email/send-challenge";
import {
  challengeService,
  requestMetadata,
  setChallengeCookie,
  setDecoyChallengeCookie,
  type ChallengePurpose,
} from "./challenges";

const WINDOW = 15 * 60 * 1000;

/** Limits for issuing challenges (sign-up, resend, forgot-password). */
export function limitChallengeCreate(req: NextRequest, email: string, purpose: ChallengePurpose) {
  const ip = clientIp(req.headers);
  const res = rateLimitAll([
    { key: `ch-create:ip:${ip}`, limit: 10, windowMs: WINDOW },
    { key: `ch-create:${purpose}:${email}`, limit: 3, windowMs: WINDOW },
  ]);
  return res.ok ? null : tooMany(res.retryAfterSeconds);
}

/** Limits for redeeming (token or phrase) and phrase-peek. */
export function limitChallengeRedeem(req: NextRequest) {
  const ip = clientIp(req.headers);
  const res = rateLimitAll([{ key: `ch-redeem:ip:${ip}`, limit: 20, windowMs: WINDOW }]);
  return res.ok ? null : tooMany(res.retryAfterSeconds);
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many tries. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Create a challenge, email it, and bind it to this browser via cookie.
 * Returns dev-only helpers when no real provider is configured.
 */
export async function issueChallenge(
  req: NextRequest,
  input: { email: string; purpose: ChallengePurpose; userId: string; name?: string | null }
) {
  const c = await challengeService.create({
    email: input.email,
    purpose: input.purpose,
    userId: input.userId,
    requestMetadata: requestMetadata(req),
  });
  const sent = await sendChallengeEmail({
    to: input.email,
    purpose: input.purpose,
    phrase: c.phrase,
    token: c.token,
    name: input.name,
    expiresInMinutes: challengeService.expiryMinutes,
  });
  await setChallengeCookie(input.purpose, c.handle);
  return devExtras({ devPhrase: c.phrase, devUrl: sent.actionUrl });
}

export async function issueDecoy(purpose: ChallengePurpose) {
  await setDecoyChallengeCookie(purpose);
}

export function devExtras<T extends object>(extras: T): Partial<T> {
  return process.env.NODE_ENV === "development" && emailProvider() === "dev-log" ? extras : {};
}
