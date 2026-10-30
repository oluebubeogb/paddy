/** Age helpers for the date-of-birth gate. Pure — safe to unit test. */

export const MIN_AGE = 13;
export const ADULT_AGE = 18;
export const MAX_AGE = 120;

export type AgeEligibility = "verified_adult" | "underage" | "unknown";

/** Whole years between `dob` and `now` (UTC calendar dates). */
export function ageOn(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function eligibilityFor(dob: Date | null | undefined, now: Date = new Date()): AgeEligibility {
  if (!dob) return "unknown";
  return ageOn(dob, now) >= ADULT_AGE ? "verified_adult" : "underage";
}

/** Parse "YYYY-MM-DD" strictly into a UTC date, or null if not a real calendar date. */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function validateDob(value: string, now: Date = new Date()): { ok: true; date: Date } | { ok: false; error: string } {
  const date = parseIsoDate(value);
  if (!date) return { ok: false, error: "That date doesn't look right." };
  if (date.getTime() > now.getTime()) return { ok: false, error: "That date is in the future." };
  const age = ageOn(date, now);
  if (age > MAX_AGE) return { ok: false, error: "That date doesn't look right." };
  if (age < MIN_AGE) return { ok: false, error: `Paddy is for people ${MIN_AGE} and older.` };
  return { ok: true, date };
}

export function toIsoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
