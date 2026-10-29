# Paddy — Privacy Controls and Account Deletion

This document describes what the product actually implements. It is not a legal privacy policy for a specific jurisdiction.

---

## Data Paddy stores

| Category | Examples | User control |
|----------|----------|--------------|
| Account | Email, password hash, timezone | Export, delete |
| Profile | Display name, preferred name | Edit, delete with account |
| Preferences | Relationship style, notification settings | Edit anytime |
| Conversations | Messages (user + assistant) | Delete conversation; export; account delete |
| Memories | Extracted facts, preferences, goals | View, edit, delete, clear category/all |
| Life context | Events, goals | Edit, delete |
| Follow-ups | Scheduled check-ins | Dismiss, cancel |
| Push subscriptions | Endpoint + encrypted keys | Unsubscribe |
| Auth challenges | Secret Phrase challenges (hashed token) | Expire automatically |
| Audit events | Account deletion, security actions | Not user-facing |

Paddy does **not** claim to be human and should not store highly sensitive content as durable memory by default (extraction filters `highly_sensitive`).

---

## Memory controls

- **View / search:** `/app/memories`
- **Edit:** PATCH `/api/memories/:id`
- **Delete one:** DELETE `/api/memories/:id` (immediate exclusion from retrieval)
- **Clear category or all:** POST `/api/memories/clear`

Conversation deletion and memory deletion are separate. Deleting a chat does not automatically wipe long-term memories; clearing memories does not delete chat history.

---

## Data export

```
POST /api/account/export
```

Returns JSON including profile, preferences, conversations, messages, memories, events, goals, and follow-ups. Authenticated users only.

---

## Account deletion

```
POST /api/account/delete
Body: { "confirmation": "DELETE MY ACCOUNT" }
```

Effects:

1. Account status set to `deleted`; email replaced with a non-usable value
2. Message and memory content redacted
3. Push subscriptions removed
4. Sessions invalidated
5. Follow-ups cancelled
6. Audit events recorded (without full conversation content)

Some infrastructure logs may retain operational metadata for a limited time according to your hosting policy. Disclose any legally required retention exceptions in your public privacy policy before launch.

---

## Notifications

- Proactive messaging is **opt-in** (default off for spontaneous; configurable in onboarding and settings).
- Quiet hours and daily limits are enforced at delivery time.
- Lock-screen previews default to generic text unless the user chooses detailed previews.
- Web Push requires explicit browser permission.

---

## Before public launch

Review applicable privacy and data-protection requirements for Nigeria and any other intended markets. Do not claim compliance with a law or certification that has not been assessed.
