# Paddy — Production Deployment Guide

Target: Docker-based VPS with HTTPS.

---

## Prerequisites

- VPS with ≥2 GB RAM (4 GB recommended)
- Docker + Docker Compose plugin
- Domain pointing to the VPS
- OpenAI-compatible API key (or other provider)

---

## 1. Prepare the server

```bash
# Install Docker (example for Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in

docker compose version
```

---

## 2. Clone and configure

```bash
git clone <your-repo> paddy && cd paddy
cp .env.example .env
```

Edit `.env`:

```
POSTGRES_PASSWORD=<strong-random>
AUTH_SECRET=<long-random-string>
APP_URL=https://your-domain.com
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
DOMAIN=your-domain.com

# Email (REQUIRED in production — sign-up fails loudly without a provider)
EMAIL_FROM="Paddy <noreply@your-domain.com>"
RESEND_API_KEY=re_...            # or, instead:
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASSWORD=...

# Optional Web Push (generate with: npx web-push generate-vapid-keys)
VAPID_SUBJECT=mailto:you@your-domain.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

---

## 3. Generate VAPID keys (for push)

```bash
npx web-push generate-vapid-keys
# Copy public and private keys into .env
```

---

## 4. Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

The one-shot `migrate` service runs `prisma migrate deploy` (baseline
`prisma/migrations/0001_init`, which also runs `CREATE EXTENSION vector`)
before `web` and `worker` start. Check it with
`docker compose -f docker-compose.prod.yml logs migrate`.

**Existing database created earlier with `prisma db push`?** Mark the
baseline as applied once instead of re-running it:
`docker compose -f docker-compose.prod.yml run --rm migrate node_modules/.bin/prisma migrate resolve --applied 0001_init`
(then apply any schema differences, e.g. the new challenge columns, with
`prisma migrate diff` → a new migration, or on a throwaway DB `prisma db push`).

### Coolify

Use the compose file but **delete the `proxy` service** (Coolify's Traefik
handles TLS). Set the domain on the `web` service, port 3000, and put the
same variables in Coolify's environment UI. `DOMAIN` is then unused.

---

## 5. Verify

```bash
curl -s https://your-domain.com/api/health | jq
# → { "status": "healthy", ... }

# Check services
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f worker
```

1. Open the site → register; you should receive “Your little secret from Paddy 💚”. Confirm via the button, or paste the phrase in the same browser
2. Complete onboarding
3. Send a chat message
4. Enable proactive messages + browser notifications in Companion settings
5. Create an explicit follow-up under Life or via chat

---

## 6. Updates with minimal downtime

```bash
git pull
docker compose -f docker-compose.prod.yml build migrate web worker
docker compose -f docker-compose.prod.yml up -d   # migrate runs first, then web/worker
```

Caddy continues serving during rebuild if the old container is still up until the new one is healthy.

---

## 7. Rollback

```bash
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml build web worker
docker compose -f docker-compose.prod.yml up -d web worker
```

Restore DB from backup if a migration was destructive (see `docs/BACKUP_AND_RESTORE.md`).

---

## Networking notes

- Postgres and Redis are on an **internal** Docker network and are not published to the host in the prod compose file.
- `web`, `worker` (and `proxy`) also join the `egress` network so they can reach the AI provider, Resend/SMTP and Web Push services.
- Only Caddy exposes ports 80/443.
- Auth rate limits (challenge create/redeem) are **in-memory per web container**. Run a single `web` replica, or move `src/lib/rate-limit.ts` to Redis before scaling out.
- Do not put `AI_API_KEY` or `VAPID_PRIVATE_KEY` in client-side code.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No sign-up email | `docker compose logs web` for `send failed`; check `RESEND_API_KEY`/`SMTP_*`, `EMAIL_FROM` domain verified |
| 502 from proxy | `docker compose logs web` — app may still be starting |
| Health degraded | DB connection string / Postgres healthy |
| No AI replies | `AI_API_KEY`, provider base URL, rate limits |
| Follow-ups not sending | Worker running? `proactiveEnabled`? Quiet hours? |
| Push not arriving | HTTPS? VAPID keys? User granted permission? Subscription in DB? |
