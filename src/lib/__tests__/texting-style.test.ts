import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTextingStyle, applyTextingStyle, buildTextingStylePrompt } from "../companion/texting-style";
import { ageOn, eligibilityFor, validateDob } from "../user/age";
import { adaptiveWaitMs } from "../chat/adaptive-wait";

test("detects abbreviations and casual casing", () => {
  const s = analyzeTextingStyle(["jsyk i'm running late", "u still coming?", "idk what to wear lol"]);
  assert.deepEqual(s.abbreviations, ["idk", "jsyk", "u"]);
  assert.equal(s.casualCasing, true);
  assert.equal(s.formal, false);
  assert.match(buildTextingStylePrompt(s), /"jsyk"/);
});

test("autocorrect-style writer is formal with no abbreviations", () => {
  const s = analyzeTextingStyle(["Hey, how are you doing today?", "I had a long day at work.", "Can you remind me tomorrow?"]);
  assert.deepEqual(s.abbreviations, []);
  assert.equal(s.formal, true);
  assert.equal(s.casualCasing, false);
  assert.match(buildTextingStylePrompt(s), /Do NOT use texting abbreviations/);
});

test("expands abbreviations the user doesn't use", () => {
  const formal = analyzeTextingStyle(["Hello there, how are you?"]);
  assert.equal(applyTextingStyle("idk, but u got this tbh", formal), "I don't know, but you got this to be honest");
  assert.equal(applyTextingStyle("Idk what to say", formal), "I don't know what to say");
});

test("mirrors only abbreviations the user used", () => {
  const s = analyzeTextingStyle(["u up?", "jsyk the party moved"]);
  assert.equal(applyTextingStyle("ok u got it, idk tho", s), "ok u got it, I don't know though");
});

test("casual casing lowercases ordinary bubble starts but keeps I and names", () => {
  const s = analyzeTextingStyle(["omg that was wild", "i can't believe it"]);
  assert.equal(applyTextingStyle("That sounds amazing", s), "that sounds amazing");
  assert.equal(applyTextingStyle("I'm so proud of you.", s), "I'm so proud of you");
  assert.equal(applyTextingStyle("Sarah will love it", s), "Sarah will love it");
  assert.equal(applyTextingStyle("Wait... really?", s), "wait... really?");
});

test("no history leaves text untouched", () => {
  const s = analyzeTextingStyle([]);
  assert.equal(applyTextingStyle("Idk. Sounds good.", s), "Idk. Sounds good.");
});

test("age eligibility", () => {
  const now = new Date(Date.UTC(2026, 9, 30));
  assert.equal(ageOn(new Date(Date.UTC(2008, 9, 30)), now), 18);
  assert.equal(ageOn(new Date(Date.UTC(2008, 9, 31)), now), 17);
  assert.equal(eligibilityFor(new Date(Date.UTC(2000, 0, 1)), now), "verified_adult");
  assert.equal(eligibilityFor(new Date(Date.UTC(2010, 0, 1)), now), "underage");
  assert.equal(eligibilityFor(null, now), "unknown");
  assert.equal(validateDob("2001-02-29", now).ok, false);
  assert.equal(validateDob("2030-01-01", now).ok, false);
  assert.equal(validateDob("2000-02-29", now).ok, true);
});

test("adaptive wait grows with typing and short bursts, shrinks for one finished message", () => {
  const finished = adaptiveWaitMs({ bubbles: ["Can you help me plan my week? I have three deadlines and a trip."], typing: false });
  const short = adaptiveWaitMs({ bubbles: ["hey", "so", "guess what"], typing: false });
  const typing = adaptiveWaitMs({ bubbles: ["hey"], typing: true });
  assert.ok(finished < short, `${finished} < ${short}`);
  assert.ok(short < typing, `${short} < ${typing}`);
  assert.ok(finished >= 2500);
});
