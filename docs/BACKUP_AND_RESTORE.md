# Paddy — Backup and Restore

## What to back up

| Asset | Location | Critical |
|-------|----------|----------|
| PostgreSQL data | Docker volume `paddy_pgdata` | **Yes** |
| Redis (optional) | Docker volume `paddy_redis` | No (queue is rediscoverable from Postgres) |
| Environment secrets | `.env` / secrets manager | **Yes** |
| VAPID keys | env | Yes if push is used |

Conversation content, memories, follow-ups, and accounts all live in PostgreSQL.

---

## Backup procedure (Docker Compose)

### 1. Logical dump (recommended)

```bash
# Create a timestamped dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U paddy -d paddy --format=custom --no-owner \
  > "paddy-backup-$(date +%Y%m%d-%H%M%S).dump"
```

Store the dump off-server (S3, another region, encrypted disk).

### 2. Volume snapshot (infrastructure-level)

If your VPS provider supports volume snapshots, snapshot the disk that holds Docker volumes. Combine with periodic logical dumps for portability.

### 3. Environment secrets

Back up `.env` (or your secrets store) separately. Never commit it to git.

---

## Restore procedure

### From a custom-format dump

```bash
# Stop app processes that write to the DB
docker compose -f docker-compose.prod.yml stop web worker

# Restore (drops existing objects in the public schema as needed)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U paddy -d paddy --clean --if-exists --no-owner \
  < paddy-backup-YYYYMMDD-HHMMSS.dump

# Restart
docker compose -f docker-compose.prod.yml start web worker
```

### Fresh database

```bash
docker compose -f docker-compose.prod.yml up -d postgres
# Wait for healthy
docker compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
# or: npx prisma db push
# Then restore dump if needed
```

---

## Retention recommendations

- Daily logical dumps, keep 7–14 days
- Weekly dumps retained for 4–8 weeks
- Test a restore at least once per quarter

---

## What is *not* required for recovery

- Redis data: follow-ups and memory jobs are durable in Postgres; the worker rediscovers due work after restart.
- Build artifacts: rebuild images from source.

---

## Verification after restore

1. `curl https://your-domain/api/health` → `status: healthy`
2. Sign in with a known account
3. Confirm conversation history and memories load
4. Confirm a scheduled follow-up still appears under Life → Pending follow-ups
