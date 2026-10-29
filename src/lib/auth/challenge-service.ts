/**
 * Paddy Secret Phrase — challenge service (framework-free, DB-agnostic).
 *
 * Security model (BLUEPRINT_SECRET_PHRASE.txt §2–§7):
 *  - `token`  : 256-bit random, sent only in the email link (Method A).
 *               Stored as sha256 `token_hash`.
 *  - `handle` : 256-bit random, returned only to the requesting browser as an
 *               httpOnly cookie. Stored as sha256 `handle_hash`.
 *  - `phrase` : natural-language UX string. Method B (paste phrase) is accepted
 *               ONLY together with the handle, so email + phrase alone is never
 *               a credential and the small phrase space can't be brute-forced.
 *  - Every challenge has an explicit purpose and is only redeemable for it.
 *  - Single use, atomic consume, 15-minute default expiry, attempt limit.
 *
 * The repository is injected so the rules are unit-testable without Postgres
 * (see src/lib/__tests__/challenges.test.ts). The Prisma binding lives in
 * ./challenges.ts.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { generateUniquePhrase, normalizePhrase } from "../phrase-generator";

export type ChallengePurpose =
  | "verify_email"
  | "reset_password"
  | "change_email"
  | "sensitive_action";

export const CHALLENGE_PURPOSES: readonly ChallengePurpose[] = [
  "verify_email",
  "reset_password",
  "change_email",
  "sensitive_action",
];

export interface ChallengeRecord {
  id: string;
  userId: string | null;
  email: string;
  purpose: ChallengePurpose;
  tokenHash: string;
  handleHash: string;
  phrase: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  createdAt: Date;
}

export interface NewChallenge {
  userId: string | null;
  email: string;
  purpose: ChallengePurpose;
  tokenHash: string;
  handleHash: string;
  phrase: string;
  expiresAt: Date;
  requestMetadata?: RequestMetadata;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

export interface ChallengeRepo {
  /** Expire all live challenges for email+purpose (replacement policy). */
  invalidateActive(email: string, purpose: ChallengePurpose, now: Date): Promise<number>;
  insert(data: NewChallenge): Promise<ChallengeRecord>;
  findByTokenHash(tokenHash: string): Promise<ChallengeRecord | null>;
  findByHandleHash(handleHash: string): Promise<ChallengeRecord | null>;
  /** Atomically increment attempt_count and return the new value. */
  incrementAttempts(id: string): Promise<number>;
  /**
   * Atomically set consumed_at iff still unconsumed, unexpired and under the
   * attempt limit. Returns true only for the single winning caller.
   */
  consumeIfActive(id: string, now: Date, maxAttempts: number): Promise<boolean>;
  deleteExpired(before: Date): Promise<number>;
}

export interface ChallengeServiceOptions {
  expiryMinutes?: number;
  maxAttempts?: number;
  now?: () => Date;
}

export interface CreatedChallenge {
  challengeId: string;
  phrase: string;
  /** Plaintext link token — only for building the email. Never log it. */
  token: string;
  /** Plaintext browser handle — only for the httpOnly cookie. */
  handle: string;
  expiresAt: Date;
}

export type RedeemFailure =
  | "invalid_token"
  | "no_challenge"
  | "purpose_mismatch"
  | "already_used"
  | "expired"
  | "too_many_attempts"
  | "invalid_phrase";

export type RedeemResult =
  | {
      success: true;
      challenge: {
        id: string;
        email: string;
        purpose: ChallengePurpose;
        userId: string | null;
        handleHash: string;
      };
    }
  | { success: false; reason: RedeemFailure; attemptsRemaining?: number };

export const DEFAULT_EXPIRY_MINUTES = 15;
export const DEFAULT_MAX_ATTEMPTS = 5;

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function createChallengeService(repo: ChallengeRepo, opts: ChallengeServiceOptions = {}) {
  const expiryMinutes =
    opts.expiryMinutes ??
    (Number(process.env.AUTH_CHALLENGE_TTL_MINUTES) || DEFAULT_EXPIRY_MINUTES);
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = opts.now ?? (() => new Date());

  function checkState(c: ChallengeRecord, purpose: ChallengePurpose): RedeemFailure | null {
    if (c.purpose !== purpose) return "purpose_mismatch";
    if (c.consumedAt) return "already_used";
    if (c.expiresAt.getTime() <= now().getTime()) return "expired";
    if (c.attemptCount >= maxAttempts) return "too_many_attempts";
    return null;
  }

  function success(c: ChallengeRecord): RedeemResult {
    return {
      success: true,
      challenge: {
        id: c.id,
        email: c.email,
        purpose: c.purpose,
        userId: c.userId,
        handleHash: c.handleHash,
      },
    };
  }

  return {
    expiryMinutes,
    maxAttempts,

    async create(input: {
      email: string;
      purpose: ChallengePurpose;
      userId?: string | null;
      expiresInMinutes?: number;
      requestMetadata?: RequestMetadata;
    }): Promise<CreatedChallenge> {
      if (!CHALLENGE_PURPOSES.includes(input.purpose)) {
        throw new Error(`Unknown challenge purpose: ${input.purpose}`);
      }
      const email = normalizeEmail(input.email);
      const token = generateSecret();
      const handle = generateSecret();
      const phrase = generateUniquePhrase();
      const expiresAt = new Date(
        now().getTime() + (input.expiresInMinutes ?? expiryMinutes) * 60_000
      );

      await repo.invalidateActive(email, input.purpose, now());

      const row = await repo.insert({
        userId: input.userId ?? null,
        email,
        purpose: input.purpose,
        tokenHash: hashSecret(token),
        handleHash: hashSecret(handle),
        phrase,
        expiresAt,
        requestMetadata: input.requestMetadata,
      });

      return { challengeId: row.id, phrase, token, handle, expiresAt };
    },

    /** Method A: email link. */
    async redeemByToken(token: string, purpose: ChallengePurpose): Promise<RedeemResult> {
      if (!token || token.length > 200) return { success: false, reason: "invalid_token" };
      const c = await repo.findByTokenHash(hashSecret(token));
      if (!c) return { success: false, reason: "invalid_token" };
      const bad = checkState(c, purpose);
      if (bad) return { success: false, reason: bad };
      const won = await repo.consumeIfActive(c.id, now(), maxAttempts);
      if (!won) return { success: false, reason: "already_used" };
      return success(c);
    },

    /** Method B: pasted phrase + the requesting browser's handle. */
    async redeemByPhrase(
      handle: string | undefined,
      phrase: string,
      purpose: ChallengePurpose
    ): Promise<RedeemResult> {
      if (!handle || handle.length > 200) return { success: false, reason: "no_challenge" };
      const c = await repo.findByHandleHash(hashSecret(handle));
      if (!c) return { success: false, reason: "no_challenge" };
      const bad = checkState(c, purpose);
      if (bad) return { success: false, reason: bad };

      const matches =
        phrase.length <= 200 && safeEqual(normalizePhrase(phrase), normalizePhrase(c.phrase));

      if (!matches) {
        const attempts = await repo.incrementAttempts(c.id);
        if (attempts >= maxAttempts) return { success: false, reason: "too_many_attempts" };
        return {
          success: false,
          reason: "invalid_phrase",
          attemptsRemaining: maxAttempts - attempts,
        };
      }

      const won = await repo.consumeIfActive(c.id, now(), maxAttempts);
      if (!won) return { success: false, reason: "already_used" };
      return success(c);
    },

    /**
     * Read (without consuming) the phrase for a live link token, so the
     * email's "Copy my secret phrase" button can open a copy page.
     */
    async peekPhraseByToken(
      token: string
    ): Promise<{ phrase: string; purpose: ChallengePurpose } | null> {
      if (!token || token.length > 200) return null;
      const c = await repo.findByTokenHash(hashSecret(token));
      if (!c || checkState(c, c.purpose)) return null;
      return { phrase: c.phrase, purpose: c.purpose };
    },

    /** Delete challenges that expired more than `graceMs` ago. */
    async purgeExpired(graceMs = 24 * 60 * 60 * 1000): Promise<number> {
      return repo.deleteExpired(new Date(now().getTime() - graceMs));
    },
  };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;

/** User-facing copy (blueprint §10). */
export const REDEEM_MESSAGES: Record<RedeemFailure, string> = {
  invalid_token: "This link isn't valid anymore. Let's send you a fresh one.",
  no_challenge:
    "We couldn't find a pending confirmation in this browser. Use the button in the email, or request a fresh one here.",
  purpose_mismatch: "This confirmation can't be used here.",
  already_used: "This little secret has already been used.",
  expired: "This little secret has expired. Let's send you a fresh one.",
  too_many_attempts: "Too many tries. Let's send you a fresh one.",
  invalid_phrase: "That phrase doesn't match. Check the email and try again.",
};
