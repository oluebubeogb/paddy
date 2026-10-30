import { test } from "node:test";
import assert from "node:assert/strict";
import { needsRotation, sessionTitle } from "../chat/sessions";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-30T12:00:00Z");

test("sessions rotate after a week or a few quiet days, never when empty", () => {
  assert.equal(needsRotation({ createdAt: new Date(now.getTime() - 2 * DAY), lastMessageAt: new Date(now.getTime() - DAY) }, now), false);
  assert.equal(needsRotation({ createdAt: new Date(now.getTime() - 8 * DAY), lastMessageAt: new Date(now.getTime() - 60_000) }, now), true);
  assert.equal(needsRotation({ createdAt: new Date(now.getTime() - 4 * DAY), lastMessageAt: new Date(now.getTime() - 3.5 * DAY) }, now), true);
  assert.equal(needsRotation({ createdAt: new Date(now.getTime() - 30 * DAY), lastMessageAt: null }, now), false);
});

test("session titles are short date ranges", () => {
  assert.equal(sessionTitle(new Date("2026-10-23T09:00:00Z"), new Date("2026-10-30T09:00:00Z"), now), "Oct 23 – Oct 30");
  assert.equal(sessionTitle(new Date("2026-10-30T09:00:00Z"), new Date("2026-10-30T20:00:00Z"), now), "Oct 30");
});
