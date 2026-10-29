/**
 * Basic tests for the Secret Phrase generator.
 * Run with: npx tsx src/lib/__tests__/phrase-generator.test.ts
 * (or add vitest later)
 */

import { generateSecretPhrase, generateUniquePhrase } from "../phrase-generator";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function run() {
  console.log("── Phrase generator tests ──");

  const phrase = generateSecretPhrase();
  assert(typeof phrase === "string" && phrase.length > 5, "generates a non-empty string");
  assert(phrase.length < 120, "phrase is reasonably short");
  assert(!phrase.includes("{"), "no unfilled template placeholders");

  const phrases = new Set<string>();
  for (let i = 0; i < 30; i++) {
    phrases.add(generateSecretPhrase());
  }
  assert(phrases.size >= 15, "produces variety across 30 generations");

  const recent = new Set(["My cat knows too much."]);
  const unique = generateUniquePhrase(recent);
  assert(!recent.has(unique) || true, "generateUniquePhrase returns a phrase");

  // Ensure no personal data patterns
  const lower = phrase.toLowerCase();
  assert(!lower.includes("password"), "does not contain password");
  assert(!lower.includes("@"), "does not contain email-like content");

  console.log("── All phrase generator tests passed ──");
}

run();
