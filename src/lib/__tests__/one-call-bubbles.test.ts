import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleBudget, batchToBubbles, splitReply, MAX_BUBBLES } from "../companion/bubbles";
import { memoryDecision, memorySchedule } from "../memory/schedule";

const LONG_WALL =
  "Hello my love, I've been thinking of you! How are you doing today? I'm so glad we get to spend some time together.";

test("bubbleBudget: tiny greetings / acks get 1 bubble", () => {
  for (const msg of ["hi", "hey", "Hi!", "ok", "lol", "gn", "thanks", "💚", "good morning"]) {
    const b = bubbleBudget([msg]);
    assert.equal(b.target, 1, `${msg} → target ${b.target}`);
    assert.ok(b.max <= 2, `${msg} → max ${b.max}`);
  }
});

test("bubbleBudget: grows with long / emotional / multi-bubble input, capped", () => {
  const short = bubbleBudget(["what are you up to tonight"]);
  const medium = bubbleBudget(["had a weird day honestly", "my sister called and we argued again?"]);
  const big = bubbleBudget([
    "ugh work was so long today and I'm exhausted",
    "my boss yelled at me in front of everyone, I felt so embarrassed and I almost cried",
    "also I think I'm getting sick?? and I still have to finish the report by friday. what should I do?",
  ]);
  assert.equal(short.target, 1);
  assert.ok(medium.target >= 2 && medium.target <= 3, `medium ${medium.target}`);
  assert.ok(big.target >= 3, `big ${big.target}`);
  assert.ok(big.max <= MAX_BUBBLES);
  assert.ok(short.target < medium.target && medium.target <= big.target);
});

test("batchToBubbles recovers numbered batches", () => {
  assert.deepEqual(batchToBubbles("[1] hi\n[2] how are u"), ["hi", "how are u"]);
  assert.deepEqual(batchToBubbles("just one"), ["just one"]);
});

test("a short 'hi' never forces 3 bubbles — even if the model over-splits", () => {
  const budget = bubbleBudget(["hi"]);
  // Model ignored the hint and sent 3 parts → merged down to the cap.
  const over = splitReply("heyy|||how are you|||missed u", 1, budget);
  assert.ok(over.length <= 2, `got ${over.length}`);
  assert.equal(over.map((b) => b.text).join(" "), "heyy how are you missed u");
  // No delimiter → no sentence-splitting into multiple bubbles for a greeting.
  assert.equal(splitReply(LONG_WALL, 1, budget).length, 1);
  assert.equal(splitReply("hey you 💚", 1, budget).length, 1);
});

test("a long emotional message can get several bubbles from one reply", () => {
  const budget = bubbleBudget([
    "I broke up with him last night and I can't stop crying",
    "I don't even know why I'm telling you this",
    "do you think I did the right thing?",
  ]);
  const out = splitReply("oh no 💔|||[reply:2] because I'm here and I care|||[reply:3] tell me what happened first", 3, budget);
  assert.equal(out.length, 3);
  assert.equal(out[1].replyTo, 2);
});

test("bubble counts vary with the input — not fixed at 2 or 3", () => {
  const counts = new Set(
    [["hi"], ["what's up with you today, anything fun"], ["long day", "so tired", "and my cat is sick, I'm worried"]].map(
      (u) => bubbleBudget(u).target
    )
  );
  assert.ok(counts.size >= 2, `targets ${[...counts]}`);
});

test("ONE provider call per turn yields multiple bubbles", async () => {
  process.env.AI_API_KEY = "test-key";
  process.env.AI_BASE_URL = "https://api.runpod.ai/v2/abc/openai/v1";
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        model: "m",
        choices: [
          {
            message: { content: "[reply:2] wait he yelled at u?? not ok\n|||\n[reply:3] and ur sick too 😩\n|||\ni'm here, tell me" },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  try {
    const { generateCompanionBubbles } = await import("../companion/engine");
    const { bubbles } = await generateCompanionBubbles(
      {
        user: { profile: null, companionPreferences: null } as never,
        recentMessages: [],
        currentMessage: "[1] ugh work was so long\n[2] my boss yelled at me in front of everyone\n[3] also i think i'm getting sick",
      },
      3
    );
    assert.equal(calls.length, 1, `expected exactly one provider call, got ${calls.length}`);
    assert.ok(calls[0].endsWith("/chat/completions"));
    assert.equal(bubbles.length, 3);
    assert.equal(bubbles[0].replyTo, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("HTTP 5xx from the provider is not retried by default (no double billing)", async () => {
  process.env.AI_API_KEY = "test-key";
  delete process.env.AI_RETRY_HTTP;
  let n = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    n++;
    return new Response("upstream error", { status: 502 });
  }) as typeof fetch;
  try {
    const { AIProvider } = await import("../ai/provider");
    const p = new AIProvider({ apiKey: "k", baseUrl: "https://example.test/v1", maxRetries: 2 });
    await assert.rejects(p.chat({ messages: [{ role: "user", content: "hi" }] }));
    assert.equal(n, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("memory extraction never runs per turn: waits for quiet + enough messages", () => {
  const s = memorySchedule({});
  assert.equal(s.mode, "idle");
  assert.equal(memoryDecision({ quietForMs: 5_000, newUserMessages: 10 }, s), "wait");
  assert.equal(memoryDecision({ quietForMs: s.idleMs + 1, newUserMessages: 1 }, s), "wait");
  assert.equal(memoryDecision({ quietForMs: s.idleMs + 1, newUserMessages: s.minUserMessages }, s), "run");
  assert.equal(memoryDecision({ quietForMs: s.staleMs + 1, newUserMessages: 1 }, s), "skip");
  assert.equal(memoryDecision({ quietForMs: 1e12, newUserMessages: 99 }, memorySchedule({ MEMORY_EXTRACTION: "off" })), "skip");
});
