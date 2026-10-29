/**
 * Paddy Secret Phrase Generator
 * Generates natural-language authentication phrases independent of user data.
 * Security comes from the associated cryptographic token, not the phrase itself.
 */

const SUBJECTS = [
  "my cat", "my imaginary assistant", "the moon", "the universe", "my coffee",
  "a colleague", "my neighbour's dog", "the office printer", "my houseplants",
  "the weather", "Monday", "my alarm clock", "the fridge", "my shadow",
  "a random pigeon", "the Wi-Fi", "my left sock", "the toaster", "my calendar",
  "the night sky", "my notebook", "a friendly ghost", "the elevator", "my playlist"
];

const OBJECTS = [
  "hug", "apology", "holiday", "duel", "promotion",
  "secret", "too much", "pineapple", "conspiracy", "instructions",
  "nap", "second chance", "my dignity", "sandwich", "the plot",
  "strange vibe", "unexplained delay", "mild crisis", "playlist",
  "overdue conversation", "mysterious package", "quiet rebellion"
];

const ADJECTIVES = [
  "suspicious", "complicated", "imaginary", "unexpected", "mildly chaotic",
  "overly dramatic", "strangely comforting", "quietly rebellious", "suspiciously cheerful",
  "accidentally legendary", "mildly legendary", "curiously persistent"
];

const TEMPLATES = [
  // Everyday life
  "I forgot where I put my imaginary {object}.",
  "Today, I'm officially retiring from {object}.",
  "My relationship with {subject} is complicated.",
  "I need a holiday from my holiday.",
  "Today feels like a {object} kind of day.",
  "I have a suspicious relationship with {subject}.",

  // Unexpected situations
  "A {subject} just challenged me to a duel.",
  "I think my {subject} is plotting something.",
  "Someone accused me of being too {adjective}.",
  "I accidentally became the office legend.",
  "The universe forgot to send my {object}.",

  // Playful confessions
  "I have a suspicious amount of affection for {object}.",
  "I need to have a serious conversation with {subject}.",
  "I may have made a terrible decision involving {object}.",
  "I really need a {object} right now.",
  "My cat knows too much.",

  // Absurd observations
  "The moon owes me an {object}.",
  "My imaginary assistant has resigned.",
  "I left my imaginary umbrella at home.",
  "A colleague asked me out.",
  "I have a suspicious relationship with Mondays.",
  "The universe forgot to send my instructions.",
  "I need a hug from the moon.",
  "My {subject} just filed a complaint.",
  "I'm currently negotiating with {subject}.",
  "Something about {subject} feels off today.",
  "I officially declared war on {object}.",
  "The toaster and I are no longer speaking.",
  "I caught my {subject} being suspiciously quiet.",
  "Today's main character energy belongs to {subject}.",
  "I may have invented a new holiday involving {object}.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string): string {
  return template
    .replace(/{subject}/g, pick(SUBJECTS))
    .replace(/{object}/g, pick(OBJECTS))
    .replace(/{adjective}/g, pick(ADJECTIVES));
}

/**
 * Generate a single natural-language secret phrase.
 * Does not use any user data, conversation history, or memories.
 */
export function generateSecretPhrase(): string {
  const template = pick(TEMPLATES);
  return fillTemplate(template);
}

/**
 * Generate a unique-looking phrase while allowing global non-uniqueness.
 * Optional recent-phrases set can be used by the caller to reduce immediate repeats.
 */
export function generateUniquePhrase(recentPhrases: Set<string> = new Set()): string {
  let phrase = generateSecretPhrase();
  let attempts = 0;
  while (recentPhrases.has(phrase) && attempts < 12) {
    phrase = generateSecretPhrase();
    attempts++;
  }
  return phrase;
}
