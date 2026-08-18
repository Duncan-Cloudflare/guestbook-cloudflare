# Guestbook Cloudflare Demo

A small, non-production guestbook application built to learn the Cloudflare Developer Platform. It uses **Cloudflare Workers**, **D1**, **KV**, and **Queues**.

---

## What it does

Visitors can sign a public guestbook. Submissions are queued, lightly moderated, and displayed once approved. An admin panel lets a moderator approve, reject, or delete entries.

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │──────│   Worker    │──────│  D1 (data)  │
└─────────────┘      │   (API/UI)  │      └─────────────┘
                     │             │      ┌─────────────┐
                     │  ├ Queue ───┤──────│ Queue async  │
                     │  │ consumer  │      │ processing  │
                     │  └───────────┘      └─────────────┘
                     │             │      ┌─────────────┐
                     └─────────────┘──────│ KV (cache)  │
                                           └─────────────┘
```

| Service | Purpose |
|---------|---------|
| **Workers** | Hosts the API and serves the static frontend. |
| **D1** | Stores guestbook entries, moderation log, and queue event audit trail. |
| **KV** | Caches the list of approved entries for fast reads. |
| **Queues** | Processes new submissions asynchronously (basic auto-moderation). |
| **GitHub Actions** | Deploys the Worker automatically on every push to `main`. |

---

## User flow

1. A visitor opens the guestbook page and submits their name and message.
2. The Worker inserts the entry into D1 with status `pending`.
3. The Worker sends a message to the Queue.
4. The Queue consumer checks the message for banned words.
   - Clean messages are auto-approved in this demo.
   - Messages containing banned words are rejected.
5. Approved entries appear on the public page and are cached in KV.

## Admin flow

1. Open `/admin.html` on the deployed site.
2. Enter the admin secret.
3. Load all entries, then approve, reject, or delete them.
4. After any moderation action, the KV cache is invalidated so the public page updates.

---

## Administrator guide

### Access the admin panel

Navigate to:

```text
https://<your-worker-url>/admin.html
```

Enter the admin secret in the password field and click **Load entries**.

### Moderate entries

Each entry shows:

- Author name
- Message text
- Current status (`pending`, `approved`, `rejected`, or `deleted`)
- Action buttons: **Approve**, **Reject**, **Delete**

Clicking an action updates the entry in D1 and invalidates the KV cache.

### Monitor the system

Use Wrangler to inspect the database and cache locally or remotely:

```bash
# View recent entries
npx wrangler d1 execute guestbook-db --remote --command="SELECT * FROM entries ORDER BY id DESC LIMIT 10;"

# View moderation history
npx wrangler d1 execute guestbook-db --remote --command="SELECT * FROM moderation_log ORDER BY id DESC LIMIT 10;"

# View queue processing events
npx wrangler d1 execute guestbook-db --remote --command="SELECT * FROM queue_events ORDER BY id DESC LIMIT 10;"

# View cached approved entries
npx wrangler kv key get entries:approved --namespace-id=<your-kv-namespace-id> --remote
```

### Live logs

```bash
npx wrangler tail
```

---

## Reset the admin password

The admin secret is stored as a Cloudflare secret, not in the repository.

### For local development

Edit `.dev.vars`:

```text
ADMIN_SECRET = "your-new-local-secret"
```

Restart `npx wrangler dev`.

### For production

Set or update the secret with Wrangler:

```bash
npx wrangler secret put ADMIN_SECRET
```

Enter the new secret when prompted. This updates the value used by the deployed Worker.

---

## Local development

```bash
npm install
npx wrangler dev
```

Then open `http://localhost:8787/`.

Local-only secrets go in `.dev.vars`. This file is gitignored and never deployed.

---

## Deployment

Pushing to the `main` branch triggers the GitHub Actions workflow at `.github/workflows/deploy.yml`.

Required repository secret:

| Secret | How to obtain |
|--------|---------------|
| `CLOUDFLARE_API_TOKEN` | Create at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with **Cloudflare Workers → Edit** permission. |

---

## Project status

This is a learning/demo project. It is not hardened for production use. See `AGENTS.md` for the full implementation plan and design notes.
