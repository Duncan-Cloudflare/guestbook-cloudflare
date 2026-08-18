# Cloudflare Guestbook Demo — Implementation Plan

> Learning project built on Cloudflare Developer Platform.  
> Services used: Workers, D1, Queues, KV.  
> Goal: build a working guestbook site to learn the platform, not to ship to production.

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Repo & Tooling | ✅ Complete | Repo created at `Duncan-Cloudflare/guestbook-cloudflare`, cloned via SSH, Node project initialized, Wrangler/TypeScript installed, `tsconfig.json`, `wrangler.jsonc`, `.gitignore` committed. |
| Phase 2 — D1 Setup | ✅ Complete | Database `guestbook-db` created (`ddbaee27-34a1-4266-8ca9-84a08fd0d52b`), binding added to `wrangler.jsonc`, migration `0001_create_tables.sql` applied locally and remotely, tables verified. |
| Phase 3 — KV & Queue Setup | ✅ Complete | KV namespace `GUESTBOOK_CACHE` created, Queue `guestbook-events` and DLQ `guestbook-events-dlq` created, producer/consumer bindings added to `wrangler.jsonc`. |
| Phase 4 — Core Worker | ⏳ Not started |  |
| Phase 5 — Queue Consumer | ⏳ Not started |  |
| Phase 6 — Frontend | ⏳ Not started |  |
| Phase 7 — Deploy & CI/CD | ⏳ Not started |  |

---

## 1. Project Goal

Build a small guestbook web app where visitors can:

- Submit a public message (name + message).
- See a list of approved messages.
- Admins can approve / reject / delete pending messages via a simple API.

Behind the scenes, new submissions are queued for async processing (moderation, notifications, analytics), cached in KV for fast reads, and persisted in D1.

---

## 2. Architecture

```
                 ┌─────────────────┐
User ───────────▶│   Cloudflare    │
(Browser)        │     Worker      │
                 │   (API + UI)    │
                 └────────┬────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     ┌─────────┐    ┌──────────┐   ┌─────────┐
     │   D1    │    │   KV     │   │ Queues  │
     │ (store) │    │ (cache)  │   │(async)  │
     └────┬────┘    └────┬─────┘   └────┬────┘
          │              │              │
          │              │              ▼
          │              │        ┌──────────┐
          │              │        │ Consumer │
          │              │        │  Worker  │
          │              │        └────┬─────┘
          │              │             │
          └───────────────┴─────────────┘
                  (writes back to D1 / KV)
```

---

## 3. Service Responsibilities

| Service | Use in this project |
|---------|---------------------|
| **Workers** | Host API routes, serve the HTML/JS frontend, handle form submission, run the Queue consumer. |
| **D1** | Persist guestbook entries, moderation status, and an audit log of actions. |
| **KV** | Cache the approved guestbook list so reads are fast; cache admin session tokens or rate-limit counters. |
| **Queues** | Queue every new submission for async moderation processing (e.g., spam check, notification, analytics batch). |
| **GitHub** | Version control, CI/CD with GitHub Actions to deploy via Wrangler on push. |

---

## 4. Data Model (D1)

Use three tables:

### `entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| `name` | TEXT NOT NULL | Display name of the guest. |
| `message` | TEXT NOT NULL | The guestbook message. |
| `status` | TEXT NOT NULL | `pending`, `approved`, `rejected`, or `deleted`. |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP |  |
| `updated_at` | DATETIME DEFAULT CURRENT_TIMESTAMP |  |

### `moderation_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| `entry_id` | INTEGER NOT NULL | FK to `entries.id`. |
| `action` | TEXT NOT NULL | `approve`, `reject`, `delete`. |
| `performed_at` | DATETIME DEFAULT CURRENT_TIMESTAMP |  |

### `queue_events` (optional, for learning)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |  |
| `entry_id` | INTEGER | Which entry the event is for. |
| `event_type` | TEXT | e.g. `new_submission`, `approved_notification`. |
| `processed_at` | DATETIME |  |
| `result` | TEXT | Success / error info. |

---

## 5. API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | Serve the guestbook HTML page. |
| GET | `/api/entries` | Return approved entries (from KV cache, fallback to D1). |
| POST | `/api/entries` | Submit a new entry. Insert into D1 as `pending`, push message to Queue. |
| GET | `/api/admin/entries` | Return pending + approved entries for moderation. |
| POST | `/api/admin/entries/:id/approve` | Approve an entry, update D1, invalidate KV cache. |
| POST | `/api/admin/entries/:id/reject` | Reject an entry, update D1, invalidate KV cache. |
| DELETE | `/api/admin/entries/:id` | Soft-delete an entry, update D1, invalidate KV cache. |

For the demo, admin routes can be protected by a simple hard-coded secret sent as a header or query param.

---

## 6. Queue Design

Create one Queue named `guestbook-events`.

Producer (main Worker on `POST /api/entries`):

```json
{
  "event": "new_submission",
  "entryId": 123,
  "name": "Alice",
  "message": "Hello!",
  "submittedAt": "2026-08-18T12:00:00Z"
}
```

Consumer Worker (`src/queue-consumer.ts`):

1. Receive the message.
2. Log the event to `queue_events` in D1.
3. Run a simple "moderation" step (for learning, this can just be a length check or banned-word list).
4. Optionally auto-approve safe messages or flag them for manual review.
5. Update D1 status if needed.
6. Invalidate KV cache if an entry became approved.

This teaches async processing, retries, and dead-letter handling.

---

## 7. KV Usage

Use a single KV namespace `GUESTBOOK_CACHE`.

- Key: `entries:approved`
- Value: JSON string of the last known approved entry list.
- TTL: 60 seconds (short, so you can see cache invalidation working).

Flow:

1. `GET /api/entries` reads KV first.
2. If KV miss or stale, query D1, write back to KV, return results.
3. On any moderation action that changes approved status, delete or overwrite the KV key.

Also optionally use KV for:

- `rate_limit:<ip>`: count submissions per IP in the last minute.
- `admin:token`: store a generated admin session token (for learning; not secure enough for real apps).

---

## 8. Frontend

A single static HTML page served from the Worker (or from a separate Pages site, but keeping it in the Worker is simpler for the demo).

Features:

- Show approved messages as cards.
- A form to submit a new message.
- Simple success / error feedback.
- Optional admin UI (password-protected by the secret) to approve/reject pending messages.

Keep it vanilla HTML + CSS + a small amount of JS to stay focused on the platform.

---

## 9. Project Folder Structure

```
guestbook-cloudflare/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Deploy via Wrangler on push to main
├── migrations/
│   ├── 0001_create_tables.sql  # D1 schema
│   └── 0002_seed_data.sql     # Optional sample entries
├── public/
│   ├── index.html              # Guestbook page
│   ├── admin.html              # Admin moderation page
│   ├── styles.css              # Basic styling
│   └── app.js                  # Frontend logic
├── src/
│   ├── index.ts                # Main Worker entry
│   ├── queue-consumer.ts       # Queue consumer Worker
│   ├── db.ts                   # D1 helpers
│   ├── kv.ts                   # KV cache helpers
│   └── types.ts                # Shared TypeScript types
├── wrangler.jsonc              # Wrangler config
├── package.json
├── tsconfig.json
└── README.md
```

- Note: Linux developer computer connects to Github via SSH instead of HTTPS.

---

## 10. Implementation Steps

### Phase 1 — Repo & Tooling

1. Create a new GitHub repository named `guestbook-cloudflare`.
2. Clone it locally.
3. Initialize Node project: `npm init -y`.
4. Install dev dependencies: `wrangler`, `@cloudflare/workers-types`, `typescript`.
5. Add `wrangler.jsonc`, `tsconfig.json`, and a `.gitignore`.

### Phase 2 — D1 Setup

6. Create D1 database: `wrangler d1 create guestbook-db`.
7. Add the database binding to `wrangler.jsonc`.
8. Write `migrations/0001_create_tables.sql`.
9. Apply migration: `wrangler d1 migrations apply guestbook-db --local` and then `--remote`.

### Phase 3 — KV & Queue Setup

10. Create KV namespace: `wrangler kv namespace create GUESTBOOK_CACHE`.
11. Create Queue: `wrangler queues create guestbook-events`.
12. Add KV namespace and Queue producer/consumer bindings in `wrangler.jsonc`.

### Phase 4 — Core Worker

13. Implement D1 helper functions in `src/db.ts`.
14. Implement KV cache helpers in `src/kv.ts`.
15. Implement main Worker routes in `src/index.ts`.
16. Test locally with `wrangler dev`.

### Phase 5 — Queue Consumer

17. Implement `src/queue-consumer.ts`.
18. Wire it to the Queue binding in `wrangler.jsonc`.
19. Test by submitting entries and watching the consumer log.

### Phase 6 — Frontend

20. Build `public/index.html`, `public/admin.html`, `public/styles.css`, and `public/app.js`.
21. Serve static files from the Worker (or use Workers Assets).

### Phase 7 — Deploy & CI/CD

22. Add Cloudflare API token to GitHub secrets.
23. Add `.github/workflows/deploy.yml`.
24. Push to `main` and verify automatic deployment.

---

## 11. Testing Strategy

- **Local:** Use `wrangler dev` and `curl` to test every endpoint.
- **Queue:** Submit entries and inspect consumer logs with `wrangler tail`.
- **KV:** Verify cache hits by submitting an entry, approving it, and confirming the public list updates after invalidation.
- **D1:** Use `wrangler d1 execute guestbook-db --command="SELECT * FROM entries;"`.
- **Remote:** After deploy, run the same `curl` tests against the production URL.

---

## 12. Learning Objectives

By the end of this build you should understand how to:

- Set up and deploy a Cloudflare Worker with Wrangler.
- Create and query a D1 database using migrations and raw SQL.
- Read from and write to KV, including TTL and cache invalidation patterns.
- Produce messages to and consume messages from a Cloudflare Queue.
- Bind multiple services to a Worker.
- Deploy automatically from GitHub Actions.
- Debug Workers locally and remotely with `wrangler dev`, `wrangler tail`, and D1 queries.

---

## 13. Non-Production Reminders

- Admin auth is intentionally simple (secret header). Do not use this pattern for real apps.
- KV is not strongly consistent; this demo accepts eventual consistency for the guestbook list.
- No input sanitization beyond basic escaping. Add proper escaping before exposing to real users.
- No rate limiting by default, but the plan leaves a hook for it in KV.

---

## 14. Optional Extensions

If you want to go further after the core build:

- Add R2 to store uploaded avatars for each guest.
- Add Pages Functions or a separate Worker as a read-only public frontend.
- Add email notifications via a third-party email API called from the Queue consumer.
- Add pagination and cursor-based listing from D1.
- Add a scheduled Worker to auto-purge rejected entries older than N days.
