# Paddy Phase 2 — Status

**Updated:** 2026-10-29

---

## Implemented

### Memory engine
| Component | Status |
|-----------|--------|
| Extraction (structured + validated) | Done |
| Persist / dedup / soft-delete | Done |
| Keyword retrieval in chat context | Done |
| Background processing pipeline | Done |
| Memories API + UI | Done |

### Life context
| Component | Status |
|-----------|--------|
| Events + goals service | Done |
| Life APIs | Done |
| Life dashboard UI | Done |

### Proactive engagement
| Component | Status |
|-----------|--------|
| Follow-up lifecycle + revalidation | Done |
| Quiet hours / daily limits | Done |
| Message generation + in-app persist | Done |
| Postgres-backed worker | Done |
| Web Push send path | Done |
| Service worker (`public/sw.js`) | Done |
| Subscribe / unsubscribe API | Done |
| VAPID public key endpoint | Done |
| Client registration helper | Done |
| Enable-notifications in settings UI | Done |

### Notifications preferences
| Component | Status |
|-----------|--------|
| GET/PATCH `/api/notifications/preferences` | Done |

### Privacy
| Component | Status |
|-----------|--------|
| Account export | Done |
| Account deletion + redaction | Done |
| Privacy documentation | Done — `docs/PRIVACY_AND_ACCOUNT_DELETION.md` |

### Operations
| Component | Status |
|-----------|--------|
| Health endpoint `/api/health` | Done |
| Production compose (web, worker, postgres, redis, caddy) | Done |
| Worker Dockerfile | Done |
| Caddyfile + security headers | Done |
| Deployment guide | Done — `docs/DEPLOYMENT.md` |
| Backup & restore guide | Done — `docs/BACKUP_AND_RESTORE.md` |

---

## Remaining / deferred

| Item | Notes |
|------|-------|
| Live E2E verification | Blocked in 1.2 GB sandbox (no Docker, npm OOM) |
| BullMQ job queue | Optional; Postgres rediscovery is durable source of truth |
| pgvector embedding search | Helper exists; needs live DB + embedding model |
| Production email provider | Secret Phrase logs to console in development |
| Official privacy policy for jurisdiction | Product docs only; legal review before launch |
| Rate limiting on all routes | Not fully applied |
| Embedding-based memory ranking | Polish item |

---

## How pieces connect

```
Chat reply
  → retrieveRelevantMemories()
  → generateCompanionResponse()
  → enqueueMemoryProcessing()
       → extract → persist memories/events
       → createFollowUpFromProposal() if eligible

Worker (poll)
  → findDueFollowUps()
  → revalidate (prefs, quiet hours, limits, event status)
  → generate message → persist (origin: proactive)
  → sendPushToUser() best-effort
  → record notification_deliveries
```

---

## Run locally (when environment allows)

```bash
npm install
docker compose up -d
cp .env.example .env   # set secrets + AI key
npx prisma generate && npx prisma db push
npm run dev            # terminal 1
npm run worker         # terminal 2
```

Production: see `docs/DEPLOYMENT.md`.
