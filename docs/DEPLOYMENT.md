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
# Set DOMAIN for Caddy
export DOMAIN=your-domain.com

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Apply schema
docker compose -f docker-compose.prod.yml exec web npx prisma db push
# or migrate deploy if you use migrations
```

---

## 5. Verify

```bash
curl -s https://your-domain.com/api/health | jq
# → { "status": "healthy", ... }

# Check services
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f worker
```

1. Open the site → register with Secret Phrase flow (check worker/web logs for dev phrase if email is not wired)
2. Complete onboarding
3. Send a chat message
4. Enable proactive messages + browser notifications in Companion settings
5. Create an explicit follow-up under Life or via chat

---

## 6. Updates with minimal downtime

```bash
git pull
docker compose -f docker-compose.prod.yml build web worker
docker compose -f docker-compose.prod.yml up -d web worker
docker compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
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
- Only Caddy exposes ports 80/443.
- Do not put `AI_API_KEY` or `VAPID_PRIVATE_KEY` in client-side code.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 502 from proxy | `docker compose logs web` — app may still be starting |
| Health degraded | DB connection string / Postgres healthy |
| No AI replies | `AI_API_KEY`, provider base URL, rate limits |
| Follow-ups not sending | Worker running? `proactiveEnabled`? Quiet hours? |
| Push not arriving | HTTPS? VAPID keys? User granted permission? Subscription in DB? |
