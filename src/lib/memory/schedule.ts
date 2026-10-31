/**
 * When to spend an AI call on memory extraction. Pure — safe to unit test.
 *
 * Extraction used to run after EVERY chat turn (fire-and-forget), which meant
 * every reply cost two provider calls on RunPod. Now it runs once per burst of
 * conversation, in the worker, after the user has gone quiet.
 */

export type MemoryMode = "idle" | "off";

export interface MemorySchedule {
  mode: MemoryMode;
  /** Conversation must be quiet this long before extraction runs. */
  idleMs: number;
  /** Need at least this many new user messages since the last extraction. */
  minUserMessages: number;
  /** Give up waiting for more messages after this long quiet (job closed, no AI call). */
  staleMs: number;
}

function envInt(env: Record<string, string | undefined>, name: string, fallback: number) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n >= 0 && env[name] !== undefined && env[name] !== "" ? n : fallback;
}

export function memorySchedule(env: Record<string, string | undefined> = process.env): MemorySchedule {
  const raw = (env.MEMORY_EXTRACTION || "idle").trim().toLowerCase();
  return {
    mode: raw === "off" || raw === "false" || raw === "0" || raw === "none" ? "off" : "idle",
    idleMs: envInt(env, "MEMORY_IDLE_MINUTES", 10) * 60_000,
    minUserMessages: Math.max(1, envInt(env, "MEMORY_MIN_USER_MESSAGES", 3)),
    staleMs: 24 * 60 * 60_000,
  };
}

export type MemoryDecision = "wait" | "run" | "skip";

export function memoryDecision(
  input: { quietForMs: number; newUserMessages: number },
  s: MemorySchedule
): MemoryDecision {
  if (s.mode === "off") return "skip";
  if (input.quietForMs < s.idleMs) return "wait";
  if (input.newUserMessages >= s.minUserMessages) return "run";
  return input.quietForMs >= s.staleMs ? "skip" : "wait";
}
