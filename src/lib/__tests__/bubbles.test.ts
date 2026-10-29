import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUserBatch, splitReply, MAX_BUBBLES } from "../companion/bubbles";
import { buildChatMessages, type CompanionContext } from "../companion/engine";

test("splitReply splits on the ||| delimiter and reads [reply:N] tags", () => {
  const out = splitReply("Hey you! 💚\n|||\n[reply:1] That meeting sounds rough\n|||\nPizza tonight? yes", 3);
  assert.deepEqual(out, [
    { text: "Hey you! 💚" },
    { text: "That meeting sounds rough", replyTo: 1 },
    { text: "Pizza tonight? yes" },
  ]);
});

test("splitReply ignores out-of-range reply tags and strips them", () => {
  const out = splitReply("[reply:7] hi there", 2);
  assert.deepEqual(out, [{ text: "hi there" }]);
});

test("splitReply drops a redundant quote of the latest bubble", () => {
  const out = splitReply("[reply:2] okay!|||see you", 2);
  assert.deepEqual(out, [{ text: "okay!" }, { text: "see you" }]);
});

test("splitReply splits one long wall of text into sentence bubbles", () => {
  const out = splitReply(
    "Hello my love, I've been thinking of you! How are you doing today? I'm so glad we get to spend some time together.",
    1
  );
  assert.ok(out.length >= 2, `expected multiple bubbles, got ${out.length}`);
  assert.equal(out.map((b) => b.text).join(" "), "Hello my love, I've been thinking of you! How are you doing today? I'm so glad we get to spend some time together.");
});

test("splitReply keeps short replies as one bubble and handles paragraphs / JSON", () => {
  assert.deepEqual(splitReply("haha same", 1), [{ text: "haha same" }]);
  assert.deepEqual(splitReply("first\n\nsecond", 1), [{ text: "first" }, { text: "second" }]);
  assert.deepEqual(splitReply('["a", {"text":"b","replyTo":1}]', 2), [{ text: "a" }, { text: "b", replyTo: 1 }]);
});

test("splitReply caps the number of bubbles", () => {
  const out = splitReply("1|||2|||3|||4|||5|||6", 1);
  assert.equal(out.length, MAX_BUBBLES);
  assert.equal(out[MAX_BUBBLES - 1].text, "4\n\n5\n\n6");
});

test("formatUserBatch numbers multiple bubbles and includes quotes", () => {
  assert.equal(formatUserBatch([{ content: "hi" }]), "hi");
  const s = formatUserBatch([
    { content: "long day" },
    { content: "yes!", quote: { role: "assistant", content: "Want pizza?" } },
  ]);
  assert.equal(s, '[1] long day\n[2] (replying to your message: "Want pizza?") yes!');
});

test("buildChatMessages joins consecutive assistant bubbles with the delimiter", () => {
  const ctx = {
    user: { profile: null, companionPreferences: null },
    recentMessages: [
      { role: "user", content: "hey" },
      { role: "assistant", content: "hi!" },
      { role: "assistant", content: "how are you?" },
    ],
    currentMessage: "good",
  } as unknown as CompanionContext;
  const msgs = buildChatMessages(ctx);
  assert.equal(msgs[2].content, "hi!\n|||\nhow are you?");
  assert.ok(msgs[0].content.includes("|||"));
});
