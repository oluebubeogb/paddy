import { test } from "node:test";
import assert from "node:assert/strict";
import { isFiller, titleFromMessages } from "../chat/session-title";
import { isAutoReplaceableTitle, sessionTitle } from "../chat/sessions";

test("greetings / small talk alone don't produce a title yet", () => {
  assert.equal(titleFromMessages(["hi"]), null);
  assert.equal(titleFromMessages(["hey paddy!", "how are u", "lol ok"]), null);
  assert.ok(isFiller("good morning 😊"));
  assert.ok(!isFiller("my boss yelled at me"));
});

test("titles come from the first meaningful user bubble(s)", () => {
  assert.equal(titleFromMessages(["hey paddy", "i'm so stressed about my exam tomorrow"]), "Stressed about exam tomorrow");
  assert.equal(
    titleFromMessages(["Hello", "I have a job interview at Google on Monday and I'm kinda nervous about it honestly"]),
    "Nervous about job interview"
  );
  assert.equal(titleFromMessages(["Guess what! I got promoted 🎉"]), "Got promoted");
  assert.equal(titleFromMessages(["I want to learn Spanish"]), "Learn Spanish");
  assert.equal(titleFromMessages(["what should i cook for dinner tonight, i have chicken rice and peppers"]), "Cook dinner tonight");
});

test("titles are short (≤ 6 words, ≤ 42 chars) even for long dumps", () => {
  const long =
    "so basically my sister is getting married next month and i have absolutely no idea what to wear or what to get her as a gift and my budget is tiny";
  const t = titleFromMessages([long])!;
  assert.ok(t.split(" ").length <= 6, t);
  assert.ok(t.length <= 42, t);
  assert.match(t, /^Sister/);
});

test("only placeholder or date-range titles get replaced", () => {
  assert.ok(isAutoReplaceableTitle(null));
  assert.ok(isAutoReplaceableTitle("New conversation"));
  assert.ok(isAutoReplaceableTitle(sessionTitle(new Date("2026-10-23"), new Date("2026-10-30"), new Date("2026-10-31"))));
  assert.ok(isAutoReplaceableTitle("Oct 3, 2025 – Oct 9, 2025"));
  assert.ok(!isAutoReplaceableTitle("Trip planning"));
});
