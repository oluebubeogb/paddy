import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSecretPhrase,
  generateUniquePhrase,
  isPhraseSafe,
  normalizePhrase,
  phraseSpaceSize,
} from "../phrase-generator";

test("generates clean, short, filled phrases", () => {
  for (let i = 0; i < 500; i++) {
    const p = generateSecretPhrase();
    assert.ok(p.length >= 8 && p.length <= 90, `length: ${p}`);
    assert.ok(!/[{}]/.test(p), `placeholder left: ${p}`);
    assert.ok(/^[A-Z]/.test(p), `capitalised: ${p}`);
    assert.ok(!/\ba [aeiou]/i.test(p), `article grammar: ${p}`);
    assert.ok(isPhraseSafe(p), `safe: ${p}`);
    assert.ok(!/@|https?:|\d/.test(p), `no emails/links/numbers: ${p}`);
  }
});

test("phrase space is large and varied", () => {
  assert.ok(phraseSpaceSize() > 20_000, `space=${phraseSpaceSize()}`);
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) seen.add(generateSecretPhrase());
  assert.ok(seen.size > 270, `distinct=${seen.size}`);
});

test("generateUniquePhrase avoids recent phrases", () => {
  const recent = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = generateUniquePhrase(recent);
    assert.ok(!recent.has(p));
    recent.add(p);
  }
});

test("offensive / sensitive filter", () => {
  assert.equal(isPhraseSafe("My cat knows your password."), false);
  assert.equal(isPhraseSafe("Visit https://evil.example"), false);
  assert.equal(isPhraseSafe("The moon owes me a sandwich."), true);
});

test("normalizePhrase tolerates paste noise", () => {
  assert.equal(
    normalizePhrase("  My cat   KNOWS too much.  "),
    normalizePhrase("my cat knows too much")
  );
  assert.equal(normalizePhrase("Paddy’s lamp"), normalizePhrase("Paddy's lamp"));
});
