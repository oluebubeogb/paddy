# Paddy Audit Report

Audit date: 2026-10-29. Source: `/workspace/paddy`. Build test run in a scratch copy at `/workspace/paddy-build`, so the original tree is untouched.

---

## 1. Stack map

### package.json
- **Scripts:** `dev`, `build` (`next build`), `start`, `lint` (`eslint`), `db:generate|migrate|push|studio`, `test` (runs only `src/lib/__tests__/phrase-generator.test.ts` via tsx), `worker` (`tsx src/worker/index.ts`).
- **Runtime deps:** next **16.4.3** (the current npm `latest`), react/react-dom 19.3.0, @prisma/client ^6.5 (resolves to 6.19.3), bcryptjs, jose (listed but sessions are opaque DB tokens), zod 3, web-push, bullmq + ioredis (listed but not used; the worker polls Postgres), date-fns, lucide-react, clsx + tailwind-merge, uuid.
- **Dev deps:** tailwindcss 4, `@tailwindcss/turbopack` (this does **not** wire up Tailwind; see Blocker B2), prisma 6, tsx, typescript 5, eslint 9 with eslint-config-next 16.4.3.
- **No `package-lock.json`** and **no `postcss.config.*`** (see §3).

### Next.js
- App Router with `output: "standalone"` (`next.config.ts`) and Turbopack build.
- `src/middleware.ts`: Next 16 warns that the "middleware" convention is deprecated and should be renamed to `proxy`.
- Route groups: `src/app/(auth)/*` serves `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password` and `/onboarding`. `src/app/(app)/*` serves **`/chat`, `/companion`, `/life`, `/memories`** at the URL root. There is no `/app` prefix (see Blocker B4).

### Prisma (`prisma/schema.prisma`, valid against 6.19.3)
- Postgres with the `pgvector` extension (`previewFeatures = ["postgresqlExtensions"]`, `extensions = [vector]`). `Memory.embedding` is `vector(1536)`.
- Models: `User`, `Session` (stores a sha256 `token_hash`, unique), **`EmailAuthChallenge` (`email_auth_challenges`)**, `UserProfile`, `CompanionPreferences`, `NotificationPreferences`, `Conversation`, `Message`, `Memory`, `LifeEvent`, `Goal`, `FollowUp` (has a unique `idempotency_key`), `PushSubscription`, `NotificationDelivery`, `MemoryProcessingJob`, `AuditEvent`.
- **There is no `prisma/migrations/` folder.** The docs rely on `prisma db push`.

### Docker / Caddy / Compose
- `Dockerfile`: three stages (deps, builder, runner) on node:22-alpine, runs as non-root `nextjs`, copies standalone output plus `.prisma` and `@prisma`, then `node server.js`.
- `Dockerfile.worker`: two stages, `npx tsx src/worker/index.ts`.
- `docker-compose.yml`: dev setup with Postgres (pgvector:pg16) and Redis 7, each with a healthcheck.
- `docker-compose.prod.yml`: postgres, redis, web, worker and Caddy proxy. Only `web` has a healthcheck (`wget /api/health`). `postgres`, `redis`, `web` and `worker` sit on an `internal: true` network.
- `Caddyfile`: `{$DOMAIN:localhost}` reverse-proxies to `web:3000`. It sets nosniff, DENY, `Referrer-Policy strict-origin-when-cross-origin`, a Permissions-Policy, and gzip.

### Auth routes (`src/app/api/auth/*`)
`sign-up`, `sign-in`, `sign-out`, `verify-email`, `forgot-password`, `reset-password`. Supporting code: `src/lib/auth/challenges.ts` (the challenge service), `src/lib/auth/session.ts` (opaque 32-byte session token, sha256 in the DB, httpOnly cookie `paddy_session`, 30 days), `src/lib/auth/password.ts` (bcrypt).

### App pages
- `src/app/(app)/chat/page.tsx`: client component with a sidebar of conversations and message bubbles. It calls `/api/conversations*`.
- `src/app/(app)/companion/page.tsx`: companion style settings and the notifications toggle (`/api/me`).
- `src/app/(app)/life/page.tsx`: events and goals (`/api/life/*`).
- `src/app/(app)/memories/page.tsx`: list, edit, delete and clear memories (`/api/memories*`).
- Backend libraries: `src/lib/companion/engine.ts`, `src/lib/ai/provider.ts` (OpenAI-compatible), `src/lib/memory/*`, `src/lib/life/events.ts`, `src/lib/proactive/*` (follow-ups, push, deliver), `src/worker/index.ts`.
- Every client `fetch()` in the pages points at an API route that exists.

---

## 2. Blueprint gap analysis: Secret Phrase

| Requirement | Status | Where / notes |
|---|---|---|
| `email_auth_challenges` table with all fields | **EXISTS** | `prisma/schema.prisma` `EmailAuthChallenge`: id, user_id (nullable), email, purpose, token_hash, phrase, expires_at, consumed_at, attempt_count, created_at, request_metadata |
| Constraints and indexes | **PARTIAL** | Indexes exist on (email, purpose), token_hash and expires_at. **`token_hash` is not `@unique`.** `purpose` is a free `String` with no enum or CHECK constraint |
| `request_metadata` populated | **MISSING** | The field exists but no route passes IP or user agent |
| Crypto-random token, only the hash stored | **EXISTS** | `challenges.ts`: `randomBytes(32)` base64url, sha256 hash stored, plaintext returned once |
| Phrase separate from the token | **EXISTS (storage)** | Separate `phrase` column. **But see the next row** |
| Phrase must not act as the credential | **VIOLATED (critical)** | `redeemChallengeByPhrase(email, phrase)` lets **email plus phrase alone** redeem a challenge. The phrase space is only **~482 distinct phrases** (31 templates × 24 subjects / 22 objects / 12 adjectives). With 5 tries per challenge and no rate limit on issuing new ones, an attacker can trigger `/forgot-password` repeatedly, guess the phrase and **reset the victim's password** (`api/auth/reset-password` accepts email + phrase). The same works for `verify-email`, which also creates a session. Fix: bind the paste flow to a challenge id kept in the requesting browser (an httpOnly cookie or a server-held handle), never to the email alone. Also limit attempts per email/IP and enlarge the phrase space |
| Phrase generator separate from memory | **EXISTS** | `src/lib/phrase-generator.ts` has no imports and uses static lists |
| Large curated vocabulary and offensive-combination filter | **MISSING / weak** | Only 24/22/12 words. No blocklist or validator. Templates produce broken grammar: "I really need a too much right now.", "The moon owes me an my dignity.", "A my cat just challenged me to a duel.", "I think my the moon is plotting something." Uses `Math.random` (acceptable for UX text only) |
| Short-lived recent-phrase record | **MISSING** | `generateUniquePhrase(recent)` accepts a set, but `createEmailChallenge` never passes one |
| Purposes verify_email / reset_password / change_email / sensitive_action | **PARTIAL** | The `ChallengePurpose` type has all four. Only verify_email and reset_password have routes. `buildVerificationUrl` sends the other two to **`/confirm`, which does not exist**. No change-email flow and no step-up or fresh-auth flow for sensitive actions |
| Purpose isolation (a reset token can't verify email, a verify token can't change a password) | **EXISTS** | Both redeem functions check `expectedPurpose`. The routes pass a fixed purpose |
| 15-minute default expiry, configurable | **EXISTS** | `DEFAULT_EXPIRY_MINUTES = 15`, overridable per call, not via env |
| Invalidate previous challenges on reissue | **EXISTS** | `updateMany` sets `consumedAt` on live challenges with the same email and purpose |
| Atomic consume | **EXISTS** | Conditional `updateMany where consumedAt: null` with a count check, in both paths |
| Failed-attempt limit | **PARTIAL** | `MAX_ATTEMPTS = 5`. Only the phrase path increments `attempt_count`; bad tokens don't, which is acceptable at this entropy |
| Rate limit on challenge creation and redemption | **MISSING** | No rate limiting anywhere in `src/app/api/auth/*` (PHASE2_STATUS.md says the same). Redis is available but unused |
| No account enumeration (reset) | **EXISTS** | `forgot-password` returns the same generic response for every email. A timing difference remains (it only writes to the DB for real users) |
| Sign-up enumeration / pre-verification takeover | **ISSUE** | `sign-up` on an *unverified* existing email **overwrites passwordHash and profile**. Squatters can hijack pending sign-ups. The UI also echoes "Sent to {email}" (minor) |
| Email delivery via a provider | **MISSING (blocker)** | No mail code at all. `sign-up` and `forgot-password` have `// TODO: send real email`, and in production **no email is sent**, so nobody can verify. `EMAIL_FROM`, `RESEND_API_KEY` and `SMTP_*` appear only in `.env.example` |
| Email delivery errors handled | **MISSING** | Nothing is sent, so there is nothing to handle |
| Email copy ("Your little secret from Paddy 💚", body, phrase box, button, safety line) | **MISSING** | No template (HTML or text). Note: a button inside an email can't run JS to copy. Use a selectable styled phrase box in the email, and put the real "Copy my secret phrase" button on the confirm page in the app |
| Click-to-verify (Method A) | **EXISTS** | `/verify-email?token=` auto-POSTs on load (`src/app/(auth)/verify-email/page.tsx`). Reset uses `/reset-password?token=` plus a new-password form |
| Paste phrase (Method B) | **EXISTS but insecure** | The verify and reset pages ask for email + phrase (see the critical row above). No copy button or "Phrase copied!" in-app, and no clipboard fallback |
| UX strings | **PARTIAL** | Success "You're all set. Welcome to Paddy! 💚" and the expired message exist in `verify-email/route.ts`, and the sign-up page uses the "Check your inbox / little secret" wording. Reset copy is "If an account exists…", not the blueprint's "Let's get you back in…". The verify page has no "send a fresh one" resend button |
| Tokens out of URL history / referrer | **PARTIAL** | The token sits in the `?token=` query string. Pages don't call `history.replaceState` to strip it. Caddy sends `strict-origin-when-cross-origin`, but the blueprint calls for `no-referrer` on the reset and verify pages. The phrase is never put in a URL (good) |
| Don't log tokens | **EXISTS (prod)** | Phrase and URL are logged and returned in the JSON response only when `NODE_ENV=development` (`devPhrase`/`devUrl`). Make sure prod never runs with `NODE_ENV=development` |
| Invalidate sessions after reset | **EXISTS** | `destroyAllUserSessions` in `reset-password/route.ts` |
| Expired-challenge cleanup | **MISSING** | No purge job in `src/worker/index.ts` |
| Reusable auth service | **PARTIAL** | The service exists, but the email build/send step and the dev logging are copy-pasted into each route instead of living in a `sendChallengeEmail()` |
| Tests (acceptance #6–9, #13) | **MISSING** | Only the phrase-generator smoke test exists. No tests for expiry, reuse, purpose mismatch, attempt limits or rate limits |

---

## 3. Deployability (Coolify / VPS)

### Build test result
`npm install` succeeded (437 packages). **`npm run build` FAILS as shipped.** After the two small fixes below (applied only in `/workspace/paddy-build`), the build succeeds with 33 routes, standalone output, `tsc --noEmit` clean, `prisma validate` OK and `npm test` passing. `eslint` reports 7 errors and 7 warnings (`no-explicit-any` and unused vars). These don't block `next build` on Next 16.

### Blockers (must fix)
- **B1. TypeScript error:** `src/lib/auth/challenges.ts:85`. `requestMetadata` (`Record<string, unknown>`) isn't assignable to Prisma `InputJsonValue`. Fix: cast it as `Prisma.InputJsonValue`.
- **B2. Tailwind not processed.** There is no `postcss.config.mjs`, so `@theme inline` fails to parse ("Unknown at rule: @theme") and **the app would ship with no utility CSS.** Fix: add `@tailwindcss/postcss` as a dev dependency plus `postcss.config.mjs` with `{ plugins: { "@tailwindcss/postcss": {} } }`. `@tailwindcss/turbopack` can probably be dropped.
- **B3. Docker build fails.** There's no `package-lock.json`, so `npm ci` errors out. The deps stage also uses `--omit=dev` and its output feeds the builder, which needs typescript, tailwind, the postcss plugin and the prisma CLI. In `Dockerfile.worker`, `--omit=dev` drops `tsx` and `prisma`, so `npx` would download *latest* prisma (8.x RC, a version mismatch) and tsx at build/run time. Fix: commit a lockfile, install everything in the builder and prune afterwards, and move `prisma` and `tsx` into dependencies (or compile the worker).
- **B4. Broken app URLs.** Pages live at `/chat`, `/life`, `/memories` and `/companion` (route group `(app)`), but every link and redirect uses **`/app/...`**, so they all 404. This affects `sign-in/page.tsx:39`, `onboarding/page.tsx:51`, `chat/page.tsx:234/242/250`, `memories:98`, `life:143`, `companion:90`, `lib/proactive/push.ts:82`, `deliver.ts:154` and `middleware.ts:27`. Middleware also protects `/app/*` only, so the real pages are **unprotected** at the edge (pages still redirect client-side when `/api/me` fails). Fix: move the folder to `src/app/app/...`, or rewrite the links and the matcher.
- **B5. No email provider.** Sign-up and reset can't work in production (see §2).
- **B6. `internal: true` network** in `docker-compose.prod.yml`. `web` and `worker` have **no outbound internet**, so AI API calls, web-push and any email provider calls fail. Put web and worker on the default network too, and keep only postgres and redis internal.
- **B7. Migrations.** There's no `prisma/migrations`, and the runner image has no prisma CLI. `exec web npx prisma db push` would try to download prisma inside a container with no egress. Fix: generate a baseline migration and run `prisma migrate deploy` in an entrypoint or one-off job (the worker image can do it once it ships the CLI). The vector extension is created by the migration.

### Caveats
- **Coolify:** Coolify brings its own Traefik on 80/443. Drop the `proxy` (Caddy) service, let Coolify route to `web:3000`, and set the Caddy headers via Traefik labels or `next.config` `headers()`. If you keep Caddy on a plain VPS, compose **doesn't pass `DOMAIN` into the proxy container** (no `environment:`), so Caddy falls back to `localhost`. Add `environment: DOMAIN: ${DOMAIN}`.
- **Healthchecks:** `web` uses `wget /api/health` (busybox wget exists on alpine; returns 503 if the DB is down). The **worker has no healthcheck**. Postgres and redis have them.
- **Redis** is provisioned but the code never uses it (bullmq and ioredis aren't imported). Keep it only if rate limiting will use it.
- **`.gitignore` has `.env*`**, which also ignores `.env.example`. Add `!.env.example`.
- `middleware.ts` should become `proxy.ts` (Next 16 deprecation warning; not fatal).
- `AUTH_SECRET` is required by compose but **never read by the code**. Sessions are DB tokens and `jose` is unused.

### Required env (from `.env.example` and compose)
`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` (required by compose, unused), `APP_URL` (used to build email links; must be the https origin), `NODE_ENV=production`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `VAPID_SUBJECT/PUBLIC_KEY/PRIVATE_KEY` (optional push), `POSTGRES_USER/PASSWORD/DB`, `DOMAIN`, `WORKER_POLL_MS`, `EMAIL_FROM` plus provider keys (`RESEND_API_KEY` or `SMTP_*`; not wired yet).

### Verdict
**Not deployable as shipped.** The build fails (B1, B2), the Docker build fails (B3), in-app navigation 404s (B4), and nobody can verify an account (B5). All of these are small, well-defined fixes, roughly half a day including a Resend integration. After that, it's deployable on Coolify or a VPS with the network, migration and Caddy caveats above.

---

## 4. UI notes (for the later sleekify pass)
- **Palette** (`src/app/globals.css`): warm stone neutrals (`#faf8f5` background, `#1c1917` text, `#78716c` muted, `#e7e5e4` borders) with a **teal** accent (`#0d9488`, `#2dd4bf` in dark mode). Dark mode follows `prefers-color-scheme` only, with no toggle. The user bubble is teal; the assistant bubble is white with a border. Radius 0.75rem.
- **Typography:** Geist Sans and Mono via `next/font`. Headings are `font-semibold tracking-tight`.
- **Components:** only two primitives, `components/ui/button.tsx` (pill-shaped `rounded-full`; primary/secondary/ghost/destructive; sm/md/lg) and `components/ui/input.tsx` (h-11, `rounded-xl`). There is no card, dialog, toast, avatar or icon usage, even though `lucide-react` is installed. The mobile menu uses a "☰" glyph and delete uses "×".
- **Auth pages:** a centred `max-w-md` column with a "Paddy" wordmark in teal, a plain form and a 💚 emoji on success screens. Clean but generic, with no illustration, brand mark or phrase card.
- **Chat:** a fixed sidebar (slide-over on mobile) with a "New chat" ghost button and nav to Memories/Life/Companion as ghost buttons. `h-14` header. Plain `whitespace-pre-wrap` bubbles with no markdown, timestamps or avatar. "Paddy is thinking…" is a text bubble, not an animated indicator. The composer is at the bottom. Empty state: "Hello 💚" and a button.
- **Companion/Life/Memories:** a `max-w-lg` single column with uppercase muted section labels and bordered cards.
- **Viewport:** `userScalable: false, maximumScale: 1` (an accessibility issue; drop it in the sleekify pass).
- **Sleekify direction:** keep the teal-on-warm-stone identity. Add a Paddy avatar or mark, an animated typing indicator, markdown rendering, lucide icons, a soft gradient or glass header, a toast component ("Phrase copied!"), the "YOUR PADDY PHRASE" card with a copy button and clipboard fallback, and a manual theme toggle.

---

## Fixes applied (turn 2, 29 Oct 2026)

Verified on box: `npm run build` ✅ (clean `.next`), `tsc --noEmit` ✅, `npm test` 15/15 ✅. Lint: 0 errors in touched auth/lib files; 7 pre-existing errors remain in (app) pages / API routes. Docker build **not attempted** (no Docker on box); migration generated but not applied to a live Postgres+pgvector.

- **Build/Docker:** InputJsonValue cast; `@tailwindcss/postcss` + `postcss.config.mjs`; `package-lock.json`; `.dockerignore`; Dockerfile builder uses full `npm ci`, runner ships Prisma engines + CLI; worker image `npm ci --omit=dev` with prisma + tsx as deps, non-root; `!.env.example`.
- **Routing:** all `/app/...` links → `/chat`, `/companion`, `/life`, `/memories`; `src/proxy.ts` (Next 16) protects them and `/onboarding`.
- **Auth:** phrase redeem bound to an httpOnly per-purpose browser handle cookie; atomic single-use consume; 5-attempt cap; re-issue expires prior challenge; rate limits on create/redeem; unique `token_hash`/`handle_hash`; `challenge_purpose` enum; `request_metadata` (IP/UA); sign-up no longer overwrites existing accounts; `?token=` stripped via `replaceState`; `no-referrer` + `no-store` on auth pages; worker purges expired challenges hourly; email via Resend → SMTP → dev log ("Your little secret from Paddy 💚"); phrase generator grammar + variety fixed (~31.7k phrases); `PhraseCard` with "Copy my secret phrase" / "Phrase copied!"; `/phrase` copy page; resend-verification endpoint. `change_email` / `sensitive_action` are stubbed (no UI, URL builder throws).
- **Compose:** `migrate` one-shot (`prisma migrate deploy`, baseline `0001_init`); web/worker/proxy on `egress`, postgres/redis internal-only; `DOMAIN` passed to Caddy; Coolify "omit proxy" notes; DEPLOYMENT.md updated.

### Still open
- change_email / sensitive_action flows not implemented.
- Rate limits are in-memory per web instance (Redis present but unused; BullMQ, jose, AUTH_SECRET unused).
- Live email delivery unverified; no "someone tried to sign up with your email" notice to verified owners.
- Phrase uniqueness among active challenges isn't enforced in DB (collision harmless: handle-bound).
- Sign-up returns 502 (with resend option) if the email provider is down.
- Pre-existing lint errors in (app) pages.
- Full UI sleekify.
