import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import {
  createChallengeService,
  type ChallengeRecord,
  type ChallengeRepo,
} from "../auth/challenge-service";

/** In-memory repo mirroring the Prisma implementation's atomic semantics. */
function fakeRepo() {
  const rows = new Map<string, ChallengeRecord>();
  const repo: ChallengeRepo = {
    async invalidateActive(email, purpose, now) {
      let n = 0;
      for (const r of rows.values())
        if (r.email === email && r.purpose === purpose && !r.consumedAt && r.expiresAt > now) {
          r.expiresAt = now;
          n++;
        }
      return n;
    },
    async insert(d) {
      for (const r of rows.values())
        if (r.tokenHash === d.tokenHash || r.handleHash === d.handleHash)
          throw new Error("unique violation");
      const row: ChallengeRecord = {
        id: randomUUID(),
        userId: d.userId,
        email: d.email,
        purpose: d.purpose,
        tokenHash: d.tokenHash,
        handleHash: d.handleHash,
        phrase: d.phrase,
        expiresAt: d.expiresAt,
        consumedAt: null,
        attemptCount: 0,
        createdAt: new Date(),
      };
      rows.set(row.id, row);
      return { ...row };
    },
    async findByTokenHash(h) {
      for (const r of rows.values()) if (r.tokenHash === h) return { ...r };
      return null;
    },
    async findByHandleHash(h) {
      for (const r of rows.values()) if (r.handleHash === h) return { ...r };
      return null;
    },
    async incrementAttempts(id) {
      const r = rows.get(id)!;
      r.attemptCount += 1;
      return r.attemptCount;
    },
    async consumeIfActive(id, now, max) {
      const r = rows.get(id);
      if (!r || r.consumedAt || r.expiresAt <= now || r.attemptCount >= max) return false;
      r.consumedAt = now;
      return true;
    },
    async deleteExpired(before) {
      let n = 0;
      for (const [id, r] of rows) {
        if (r.expiresAt < before) {
          rows.delete(id);
          n++;
        }
      }
      return n;
    },
  };
  return { repo, rows };
}

function setup() {
  let now = new Date("2026-10-29T12:00:00Z");
  const { repo, rows } = fakeRepo();
  const svc = createChallengeService(repo, {
    expiryMinutes: 15,
    maxAttempts: 5,
    now: () => now,
  });
  return { svc, rows, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

const base = { email: "Ada@Example.com ", purpose: "verify_email" as const, userId: "u1" };

test("token redeems exactly once", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  const first = await svc.redeemByToken(c.token, "verify_email");
  assert.equal(first.success, true);
  if (first.success) assert.equal(first.challenge.email, "ada@example.com");
  const second = await svc.redeemByToken(c.token, "verify_email");
  assert.deepEqual(second, { success: false, reason: "already_used" });
  // phrase path is also dead after token use
  const third = await svc.redeemByPhrase(c.handle, c.phrase, "verify_email");
  assert.equal(third.success, false);
});

test("concurrent redeems: only one wins", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  const results = await Promise.all([
    svc.redeemByToken(c.token, "verify_email"),
    svc.redeemByToken(c.token, "verify_email"),
    svc.redeemByPhrase(c.handle, c.phrase, "verify_email"),
  ]);
  assert.equal(results.filter((r) => r.success).length, 1);
});

test("expired challenge is rejected", async () => {
  const { svc, advance } = setup();
  const c = await svc.create(base);
  advance(15 * 60 * 1000 + 1);
  assert.deepEqual(await svc.redeemByToken(c.token, "verify_email"), {
    success: false,
    reason: "expired",
  });
  assert.deepEqual(await svc.redeemByPhrase(c.handle, c.phrase, "verify_email"), {
    success: false,
    reason: "expired",
  });
});

test("purpose mismatch is rejected and does not consume", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  assert.deepEqual(await svc.redeemByToken(c.token, "reset_password"), {
    success: false,
    reason: "purpose_mismatch",
  });
  assert.deepEqual(await svc.redeemByPhrase(c.handle, c.phrase, "reset_password"), {
    success: false,
    reason: "purpose_mismatch",
  });
  assert.equal((await svc.redeemByToken(c.token, "verify_email")).success, true);
});

test("attempt limit locks the challenge", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  for (let i = 1; i <= 4; i++) {
    const r = await svc.redeemByPhrase(c.handle, "wrong phrase", "verify_email");
    assert.deepEqual(r, { success: false, reason: "invalid_phrase", attemptsRemaining: 5 - i });
  }
  assert.deepEqual(await svc.redeemByPhrase(c.handle, "wrong again", "verify_email"), {
    success: false,
    reason: "too_many_attempts",
  });
  // correct phrase AND token are now refused
  assert.deepEqual(await svc.redeemByPhrase(c.handle, c.phrase, "verify_email"), {
    success: false,
    reason: "too_many_attempts",
  });
  assert.deepEqual(await svc.redeemByToken(c.token, "verify_email"), {
    success: false,
    reason: "too_many_attempts",
  });
});

test("phrase without the browser handle never redeems", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  assert.deepEqual(await svc.redeemByPhrase(undefined, c.phrase, "verify_email"), {
    success: false,
    reason: "no_challenge",
  });
  assert.deepEqual(await svc.redeemByPhrase("forged-handle", c.phrase, "verify_email"), {
    success: false,
    reason: "no_challenge",
  });
});

test("phrase redeem is forgiving about case/spacing/punctuation", async () => {
  const { svc } = setup();
  const c = await svc.create(base);
  const messy = `  ${c.phrase.toUpperCase().replace(/[.!?]$/, "")}   `;
  assert.equal((await svc.redeemByPhrase(c.handle, messy, "verify_email")).success, true);
});

test("re-issuing invalidates the previous challenge", async () => {
  const { svc } = setup();
  const a = await svc.create(base);
  const b = await svc.create(base);
  assert.equal((await svc.redeemByToken(a.token, "verify_email")).success, false);
  assert.equal((await svc.redeemByToken(b.token, "verify_email")).success, true);
});

test("secrets are stored hashed only", async () => {
  const { svc, rows } = setup();
  const c = await svc.create(base);
  const row = [...rows.values()][0];
  assert.notEqual(row.tokenHash, c.token);
  assert.notEqual(row.handleHash, c.handle);
  assert.match(row.tokenHash, /^[0-9a-f]{64}$/);
});

test("purgeExpired removes old rows only", async () => {
  const { svc, rows, advance } = setup();
  await svc.create(base);
  advance(2 * 24 * 60 * 60 * 1000);
  await svc.create({ ...base, email: "other@example.com" });
  assert.equal(await svc.purgeExpired(), 1);
  assert.equal(rows.size, 1);
});
