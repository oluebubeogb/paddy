/**
 * Paddy Secret Phrase Generator
 *
 * Produces short, playful, first-person phrases for email challenges.
 * - Independent of user data: no imports of memory, chat, or profile code.
 * - UX only: security comes from the challenge token + browser handle
 *   (see src/lib/auth/challenges.ts), never from the phrase.
 * - Grammar-safe: every slot has a typed vocabulary (singular noun, plural,
 *   activity, adjective, …) and articles are computed, so templates never
 *   produce "an my dignity" or "a my cat".
 */

import { randomInt } from "crypto";

// ── Vocabulary ─────────────────────────────────────────────
// Harmless, everyday or whimsical singular nouns (no article).
const THINGS = [
  "umbrella", "toaster", "houseplant", "stapler", "teapot", "sock", "alarm clock",
  "notebook", "spreadsheet", "backpack", "bicycle", "kettle", "lamp", "sofa",
  "rubber duck", "calendar", "playlist", "sandwich", "pineapple", "croissant",
  "cactus", "coffee mug", "printer", "elevator", "lunchbox", "suitcase", "scarf",
  "paperclip", "pancake", "jigsaw puzzle", "snow globe", "garden gnome", "kite",
  "hammock", "sticky note", "teaspoon", "doughnut", "accordion", "trombone",
  "lighthouse", "hot air balloon", "watering can", "pillow fort", "flip-flop",
  "muffin", "biscuit", "coconut", "umbrella stand", "office chair", "yo-yo",
  "spatula", "compass", "telescope", "treasure map", "sandcastle", "bookshelf",
];

// Animals and friendly characters (singular, no article).
const CREATURES = [
  "pigeon", "goose", "raccoon", "squirrel", "hedgehog", "penguin", "llama",
  "otter", "seagull", "goldfish", "hamster", "parrot", "tortoise", "duckling",
  "koala", "panda", "flamingo", "owl", "badger", "beaver", "alpaca", "sloth",
  "snail", "ladybird", "dragon", "unicorn", "friendly ghost", "garden robot",
  "office plant", "snowman", "neighbour's cat", "houseplant",
];

const PLURALS = [
  "Mondays", "pineapples", "spreadsheets", "rubber ducks", "biscuits",
  "houseplants", "pancakes", "umbrellas", "sticky notes", "puddles",
  "croissants", "paperclips", "cloudy days", "board games", "jigsaw puzzles",
  "tiny hats", "socks with patterns", "snacks", "Tuesday afternoons",
  "garden gnomes", "teapots", "postcards", "playlists", "flamingos", "pigeons",
  "doughnuts", "lighthouses", "cardigans", "bubble wrap", "crossword puzzles",
];

// Gerund/activity phrases: "retiring from ___".
const ACTIVITIES = [
  "folding laundry", "small talk", "early mornings", "group chats",
  "matching socks", "replying to emails", "making decisions", "being sensible",
  "assembling furniture", "untangling cables", "remembering passwords",
  "pretending to jog", "watering plants", "choosing snacks", "doing the dishes",
  "organising drawers", "naming houseplants", "planning ahead", "adulting",
  "waiting for the kettle", "hunting for the TV remote", "packing light",
];

const ADJECTIVES = [
  "cheerful", "dramatic", "mysterious", "punctual", "curious", "sparkly",
  "philosophical", "fancy", "enthusiastic", "chilled", "polite", "fabulous",
  "organised", "optimistic", "whimsical", "competitive about board games",
  "good at parallel parking", "into houseplants", "fond of pancakes", "sleepy",
];

// Things one can be owed: "The moon owes me ___". Article included.
const OWED = [
  "an apology", "a sandwich", "an explanation", "a holiday", "a biscuit",
  "a favour", "a postcard", "a cup of tea", "a thank-you note", "a dance",
  "a nap", "five minutes", "a croissant", "a rematch", "a birthday cake",
];

const PLACES = [
  "home", "the office", "the bakery", "the beach", "the library", "the bus stop",
  "my grandmother's", "the supermarket", "the park", "the cinema",
  "the train station", "the swimming pool", "the museum", "the café",
];

const CELESTIAL = [
  "The moon", "The universe", "The sun", "My horoscope", "The weather",
  "The Wi-Fi", "My alarm clock", "The office printer", "My calendar", "The kettle",
];

// ── Templates ──────────────────────────────────────────────
// Slots: {thing} {a_thing} {creature} {a_creature} {plural} {activity}
//        {adjective} {owed} {place} {celestial}
const TEMPLATES = [
  // Everyday life
  "I forgot where I put my imaginary {thing}.",
  "Today, I'm officially retiring from {activity}.",
  "My relationship with {plural} is complicated.",
  "I need a holiday from {activity}.",
  "Today feels like {a_thing} kind of day.",
  "I left my imaginary {thing} at {place}.",
  "I have a suspicious relationship with {plural}.",
  "I'm taking a short break from {activity}.",
  "My {thing} and I need some space.",

  // Unexpected situations
  "{a_creature} just challenged me to a duel.",
  "I think my {thing} is plotting something.",
  "Someone accused me of being too {adjective}.",
  "I accidentally became famous at {place}.",
  "{a_creature} stole my {thing} at {place}.",
  "{a_creature} asked me for directions to {place}.",
  "I accidentally adopted {a_creature}.",
  "{a_creature} keeps winking at me.",

  // Playful confessions
  "I have a suspicious amount of affection for {plural}.",
  "I need to have a serious conversation with my {thing}.",
  "I may have made a terrible decision involving {a_thing}.",
  "I really need a hug from {a_creature} right now.",
  "My {creature} knows too much.",
  "I secretly practise being {adjective}.",
  "I named my {thing} after {a_creature}.",
  "I owe {a_creature} an apology.",

  // Absurd observations
  "{celestial} owes me {owed}.",
  "My {thing} has officially resigned.",
  "The universe forgot to send my {thing}.",
  "{celestial} is being suspiciously quiet today.",
  "My {thing} just filed a complaint.",
  "I'm currently negotiating with {a_creature}.",
  "Something about my {thing} feels off today.",
  "Today's main character is {a_creature}.",
  "I may have invented a holiday for {plural}.",
  "{celestial} told me to buy {a_thing}.",
];

// ── Safety filter ──────────────────────────────────────────
// Vocabulary is curated, but combinations are still checked so future edits
// can't introduce explicit, alarming, discriminatory or embarrassing output.
const BLOCKED_PATTERNS: RegExp[] = [
  /\b(kill|die|dead|death|blood|gun|knife|bomb|attack|suicide|hurt)\w*/i,
  /\b(sex|naked|nude|kiss|date|flirt|bed|drunk|drug|beer|wine|vodka)\w*/i,
  /\b(hate|stupid|ugly|fat|idiot|dumb)\b/i,
  /\b(password|bank|account|pin|ssn|card|money|police|hospital|doctor|sick)\b/i,
  /\b(race|religion|god|church|gay|politic)\w*/i,
  /@|https?:|www\.|\d{3,}/i, // no emails, links, long numbers
];

export function isPhraseSafe(phrase: string): boolean {
  if (phrase.length < 8 || phrase.length > 90) return false;
  if (/[{}]/.test(phrase)) return false;
  return !BLOCKED_PATTERNS.some((re) => re.test(phrase));
}

// ── Helpers ────────────────────────────────────────────────
function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fillTemplate(template: string): string {
  const out = template
    .replace(/{a_thing}/g, () => withArticle(pick(THINGS)))
    .replace(/{thing}/g, () => pick(THINGS))
    .replace(/{a_creature}/g, () => withArticle(pick(CREATURES)))
    .replace(/{creature}/g, () => pick(CREATURES))
    .replace(/{plural}/g, () => pick(PLURALS))
    .replace(/{activity}/g, () => pick(ACTIVITIES))
    .replace(/{adjective}/g, () => pick(ADJECTIVES))
    .replace(/{owed}/g, () => pick(OWED))
    .replace(/{place}/g, () => pick(PLACES))
    .replace(/{celestial}/g, () => pick(CELESTIAL));
  return capitalise(out);
}

// Pick templates weighted by (sqrt of) how many phrases each can produce, so
// low-variety templates don't dominate and collisions stay rare.
function templateWeight(t: string): number {
  const sizes: Record<string, number> = slotSizes();
  return (t.match(/{(\w+)}/g) ?? []).reduce((n, s) => n * sizes[s.slice(1, -1)], 1);
}
let cumulative: number[] | null = null;
function pickTemplate(): string {
  if (!cumulative) {
    let acc = 0;
    // sqrt keeps big templates from crowding out the rest while still
    // favouring high-variety ones.
    cumulative = TEMPLATES.map((t) => (acc += Math.ceil(Math.sqrt(templateWeight(t)))));
  }
  const total = cumulative[cumulative.length - 1];
  const r = randomInt(total);
  const idx = cumulative.findIndex((c) => r < c);
  return TEMPLATES[idx];
}

/** Generate a single natural-language phrase (no user data involved). */
export function generateSecretPhrase(): string {
  for (let i = 0; i < 20; i++) {
    const phrase = fillTemplate(pickTemplate());
    if (isPhraseSafe(phrase)) return phrase;
  }
  return "My imaginary assistant has resigned.";
}

// ── Short-lived recent-phrase record (blueprint §9) ────────
// In-memory only, per process, auto-expiring. Not a permanent database.
const RECENT_TTL_MS = 30 * 60 * 1000;
const RECENT_MAX = 1000;
const recent = new Map<string, number>(); // phrase -> issuedAt

function pruneRecent(now: number) {
  for (const [p, at] of recent) {
    if (now - at > RECENT_TTL_MS || recent.size > RECENT_MAX) recent.delete(p);
    else break; // Map keeps insertion order; the rest are newer
  }
}

/**
 * Generate a phrase avoiding recently issued ones (best effort).
 * Global uniqueness is NOT required or relied on.
 */
export function generateUniquePhrase(extraRecent: Set<string> = new Set()): string {
  const now = Date.now();
  pruneRecent(now);
  let phrase = generateSecretPhrase();
  for (let i = 0; i < 12 && (recent.has(phrase) || extraRecent.has(phrase)); i++) {
    phrase = generateSecretPhrase();
  }
  recent.delete(phrase);
  recent.set(phrase, now);
  return phrase;
}

/** Normalise a pasted phrase for comparison (case, quotes, spacing, trailing punctuation). */
export function normalizePhrase(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D"]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s'"]+|[\s.!?'"]+$/g, "");
}

function slotSizes(): Record<string, number> {
  return {
    thing: THINGS.length, a_thing: THINGS.length, creature: CREATURES.length,
    a_creature: CREATURES.length, plural: PLURALS.length, activity: ACTIVITIES.length,
    adjective: ADJECTIVES.length, owed: OWED.length, place: PLACES.length,
    celestial: CELESTIAL.length,
  };
}

/** Approximate number of distinct phrases (for tests/docs). */
export function phraseSpaceSize(): number {
  return TEMPLATES.reduce((sum, t) => sum + templateWeight(t), 0);
}
