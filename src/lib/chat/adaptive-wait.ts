/**
 * Adaptive "wait before Paddy replies" timing.
 *
 * People text in bursts — a few short bubbles, a pause to think, more typing.
 * Instead of a fixed 2s/9s window, Paddy waits longer while the user is clearly
 * mid-thought and replies sooner after one clear, finished message.
 * Pure — unit tested, and shared by the chat client.
 */

/** Keystrokes within this window mean "still typing". */
export const TYPING_ACTIVE_MS = 4_000;
/** Hard ceiling from the first queued bubble while the user keeps typing. */
export const MAX_WAIT_TYPING_MS = 60_000;
/** Hard ceiling from the first queued bubble when they've gone quiet. */
export const MAX_WAIT_IDLE_MS = 30_000;
/** How often to re-check while the user is typing. */
export const TYPING_RECHECK_MS = 1_000;

const FINISHED_MS = 3_000;
const BASE_MS = 6_000;
const PER_EXTRA_BUBBLE_MS = 1_500;
const PER_SHORT_BUBBLE_MS = 1_000;
const TYPING_MS = 15_000;
const QUIET_CEILING_MS = 15_000;

const ENDS_FINISHED = /([.!?…)]|\p{Extended_Pictographic})\s*$/u;

function isShort(text: string) {
  return text.trim().length < 25 || !ENDS_FINISHED.test(text.trim());
}

/** A single message that reads as complete: decent length and properly ended. */
export function looksFinished(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  if (!ENDS_FINISHED.test(t)) return false;
  // Trailing connectors ("and…", "so") mean more is coming.
  return !/\b(and|but|so|also|because|cuz|like|or)\W*$/i.test(t);
}

/**
 * Quiet time (ms since the user's last bubble/keystroke) before Paddy replies.
 * @param bubbles the queued user bubbles, oldest first
 * @param typing whether the composer shows active typing right now
 */
export function adaptiveWaitMs({ bubbles, typing }: { bubbles: string[]; typing: boolean }): number {
  if (!bubbles.length) return BASE_MS;
  if (typing) {
    // Mid-thought — give them room. Extra room after several short bursts.
    const shorts = bubbles.filter(isShort).length;
    return Math.min(QUIET_CEILING_MS + 10_000, TYPING_MS + shorts * PER_SHORT_BUBBLE_MS);
  }
  if (bubbles.length === 1 && looksFinished(bubbles[0])) return FINISHED_MS;

  const shorts = bubbles.filter(isShort).length;
  const last = bubbles[bubbles.length - 1].trim();
  let ms = BASE_MS + (bubbles.length - 1) * PER_EXTRA_BUBBLE_MS + shorts * PER_SHORT_BUBBLE_MS;
  // Ending on a clear question nudges a faster reply.
  if (/\?\s*$/.test(last) && last.length >= 12) ms -= 2_000;
  // Trailing "..." or a connector → they're probably not done.
  if (/(\.\.\.|…|\b(and|but|so|also))\s*$/i.test(last)) ms += 3_000;
  return Math.max(FINISHED_MS, Math.min(QUIET_CEILING_MS, ms));
}
