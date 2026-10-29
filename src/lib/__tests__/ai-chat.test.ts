import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAiBaseUrl } from "../ai/provider";
import { buildChatMessages, FAILED_REPLY_TEXT, type CompanionContext } from "../companion/engine";

test("normalizeAiBaseUrl handles RunPod and pasted endpoints", () => {
  assert.equal(
    normalizeAiBaseUrl("https://api.runpod.ai/v2/abc123/"),
    "https://api.runpod.ai/v2/abc123/openai/v1",
  );
  assert.equal(
    normalizeAiBaseUrl("https://api.runpod.ai/v2/abc123/openai/v1/chat/completions"),
    "https://api.runpod.ai/v2/abc123/openai/v1",
  );
  assert.equal(normalizeAiBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
});

function ctx(recent: { role: string; content: string }[], current: string): CompanionContext {
  return {
    user: { name: "Ada", profile: null, companionPreferences: null } as unknown as CompanionContext["user"],
    recentMessages: recent,
    currentMessage: current,
  };
}

test("buildChatMessages alternates roles and never duplicates the current turn", () => {
  const msgs = buildChatMessages(
    ctx(
      [
        { role: "assistant", content: "Welcome!" },
        { role: "user", content: "hi" },
        { role: "assistant", content: FAILED_REPLY_TEXT },
        { role: "user", content: "hello?" },
        { role: "system", content: "ignored" },
      ],
      "are you there",
    ),
  );
  assert.equal(msgs[0].role, "system");
  const turns = msgs.slice(1);
  assert.equal(turns[0].role, "user");
  for (let i = 1; i < turns.length; i++) assert.notEqual(turns[i].role, turns[i - 1].role);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].content, "hi\n\nhello?\n\nare you there");
});
