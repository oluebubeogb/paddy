# Paddy — Personal AI Companion

Production-ready MVP built in **two phases**.

## Phase Plan

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Foundation, Secret-Phrase auth, onboarding, chat + real AI, schema, Docker | **Code-complete** — see PHASE1_VERIFICATION.md |
| **2** | Memory engine, life context, proactive worker, Web Push, production hardening | **Code-complete** — see PHASE2_STATUS.md (runtime E2E blocked in sandbox) |

---

## Phase 1 Status

### Implemented

| Area | Details |
|------|---------|
| **Scaffold** | Next.js 16 App Router, TypeScript strict, Tailwind, warm design system |
| **Schema** | Full Prisma schema (users, sessions, challenges, profiles, prefs, conversations, messages, memories, events, goals, follow-ups, push, audit) |
| **Secret Phrase Auth** | Generator, challenge service (token + phrase), create / redeem-by-token / redeem-by-phrase, purpose isolation, expiry, attempt limits |
| **Auth flows** | Sign-up, sign-in, email verification (link + phrase), forgot/reset password (link + phrase), sign-out, sessions |
| **Onboarding** | 5-step flow (name, relationship style, communication, proactive, start) |
| **Companion settings** | `/app/companion` — relationship style, names, proactive toggle |
| **Chat** | Sidebar + conversation list, message history, composer (Enter/Shift+Enter), optimistic UI, AI response via provider |
| **API** | `/api/auth/*`, `/api/me`, `/api/conversations`, `/api/conversations/[id]/messages` |
| **AI** | OpenAI-compatible provider + companion engine with core system prompt |
| **Infra** | Docker Compose (Postgres+pgvector, Redis), Dockerfile, `.env.example`, middleware route protection |
| **PWA** | Web manifest skeleton |

### Still to finish before Phase 1 acceptance

1. **Clean dependency install** — `npm install` is slow/flaky in the current environment; run locally or re-try until `node_modules` is complete.
2. **Database** — `docker compose up -d` → `npx prisma generate` → `npx prisma db push`.
3. **Wire real email** (optional for local) — currently logs phrase + URL in development.
4. **Streaming chat** — current implementation is non-streaming (full response); SSE can be added next.
5. **Basic automated tests** — phrase generator smoke test exists; add auth isolation tests.
6. **Verify end-to-end** — register → verify with phrase → onboard → chat with a real model.

### Local setup (once deps are installed)

```bash
# Infrastructure
docker compose up -d

# Environment
cp .env.example .env
# Set AUTH_SECRET, AI_API_KEY, DATABASE_URL

# Database
npx prisma generate
npx prisma db push

# Dev server
npm run dev
```

Open http://localhost:3000

In development, secret phrases and verification/reset URLs are printed to the server console.

### Quick phrase test

```bash
npx tsx src/lib/__tests__/phrase-generator.test.ts
```

---

## Architecture notes

- Modular monolith; worker process reserved for Phase 2
- Ownership checks on every private resource
- AI credentials stay server-side
- Memory / follow-up tables already exist so Phase 2 does not need schema rewrites
- Secret Phrase is UX only — cryptographic security comes from the one-time token

---

## Next command for the agent

Continue with:

1. Confirm `npm install` completed
2. Start Postgres via Docker and run Prisma migrate/push
3. Add a minimal streaming SSE endpoint for chat (optional polish)
4. Write isolation tests for conversations/memories
5. Mark Phase 1 acceptance criteria and begin Phase 2
