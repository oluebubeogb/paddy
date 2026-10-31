/**
 * Writes HTML previews of every Paddy email to ./email-previews/.
 *   APP_URL=https://your.domain npx tsx scripts/preview-emails.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderChallengeEmail } from "../src/lib/email/send-challenge";
import {
  renderBirthdayEmail,
  renderCheckInEmail,
  renderMemoryEmail,
} from "../src/lib/email/companion-emails";

mkdirSync("email-previews", { recursive: true });
const out = (name: string, m: { html: string; text: string; subject: string }) => {
  writeFileSync(`email-previews/${name}.html`, m.html);
  writeFileSync(`email-previews/${name}.txt`, `Subject: ${m.subject}\n\n${m.text}`);
};
out("verify", renderChallengeEmail({ purpose: "verify_email", phrase: "golden otter hums softly", token: "tok", name: "Ada", expiresInMinutes: 15 }));
out("reset", renderChallengeEmail({ purpose: "reset_password", phrase: "quiet maple drifts home", token: "tok", name: null, expiresInMinutes: 15 }));
out("birthday", renderBirthdayEmail({ name: "Ada" }));
out("memory", renderMemoryEmail({ name: "Ada", memory: "your job interview on Friday", question: "sooo how did it go??" }));
out("check-in", renderCheckInEmail({ name: "Ada", message: "hey, was just thinking about you. hope the week's been kind. jsyk I'm here if u wanna talk 💚" }));
console.log("wrote email-previews/*.html");
