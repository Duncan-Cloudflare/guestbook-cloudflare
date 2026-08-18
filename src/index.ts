import type { Env, GuestbookEntry, QueueMessage } from './types';
import * as db from './db';
import * as kv from './kv';
import { handleQueue } from './queue-consumer';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401);
}

function checkAdmin(request: Request, env: Env): boolean {
  const secret = request.headers.get('X-Admin-Secret');
  return secret === env.ADMIN_SECRET;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPage(title: string, body: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; }
    .entry { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .entry .name { font-weight: bold; color: #333; }
    .entry .date { color: #666; font-size: 0.875rem; }
    form { display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0; }
    input, textarea, button { padding: 0.5rem; font-size: 1rem; }
    button { cursor: pointer; background: #0066cc; color: white; border: none; border-radius: 4px; }
    button:hover { background: #0052a3; }
    #message { margin: 1rem 0; padding: 0.75rem; border-radius: 4px; display: none; }
    #message.success { background: #d4edda; color: #155724; display: block; }
    #message.error { background: #f8d7da; color: #721c24; display: block; }
  </style>
</head>
<body>
  ${body}
  <script>
    const form = document.getElementById('guestbook-form');
    const msg = document.getElementById('message');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const res = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok) {
          msg.className = 'success';
          msg.textContent = 'Thanks! Your message is pending moderation.';
          form.reset();
        } else {
          msg.className = 'error';
          msg.textContent = result.error || 'Something went wrong.';
        }
      });
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

function renderGuestbook(entries: GuestbookEntry[]): Response {
  const entriesHtml = entries.length
    ? entries
        .map(
          (e) => `
      <div class="entry">
        <div class="name">${escapeHtml(e.name)}</div>
        <div class="date">${new Date(e.created_at).toLocaleString()}</div>
        <p>${escapeHtml(e.message)}</p>
      </div>
    `
        )
        .join('')
    : '<p>No messages yet. Be the first!</p>';

  const body = `
    <h1>Guestbook</h1>
    <div id="message"></div>
    <form id="guestbook-form">
      <input type="text" name="name" placeholder="Your name" required maxlength="100">
      <textarea name="message" placeholder="Your message" required maxlength="1000" rows="4"></textarea>
      <button type="submit">Sign Guestbook</button>
    </form>
    <h2>Messages</h2>
    ${entriesHtml}
  `;
  return renderPage('Guestbook', body);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Public pages
    if (path === '/' && request.method === 'GET') {
      const cached = await kv.getCachedEntries(env);
      const entries = cached ?? (await db.getApprovedEntries(env));
      if (!cached) {
        ctx.waitUntil(kv.setCachedEntries(env, entries));
      }
      return renderGuestbook(entries);
    }

    // Public API
    if (path === '/api/entries' && request.method === 'GET') {
      const cached = await kv.getCachedEntries(env);
      if (cached) return json(cached);
      const entries = await db.getApprovedEntries(env);
      ctx.waitUntil(kv.setCachedEntries(env, entries));
      return json(entries);
    }

    if (path === '/api/entries' && request.method === 'POST') {
      try {
        const body = (await request.json()) as { name?: string; message?: string };
        const name = (body.name ?? '').trim();
        const message = (body.message ?? '').trim();

        if (!name || !message) {
          return json({ error: 'Name and message are required' }, 400);
        }
        if (name.length > 100 || message.length > 1000) {
          return json({ error: 'Name or message too long' }, 400);
        }

        const entry = await db.createEntry(env, name, message);
        const queueMessage: QueueMessage = {
          event: 'new_submission',
          entryId: entry.id,
          name: entry.name,
          message: entry.message,
          submittedAt: entry.created_at,
        };
        await env.GUESTBOOK_EVENTS.send(queueMessage);
        return json({ success: true, entry }, 201);
      } catch (err) {
        return json({ error: 'Invalid request' }, 400);
      }
    }

    // Admin API
    if (!checkAdmin(request, env)) {
      return unauthorized();
    }

    if (path === '/api/admin/entries' && request.method === 'GET') {
      const entries = await db.getAllEntries(env);
      return json(entries);
    }

    const approveMatch = path.match(/^\/api\/admin\/entries\/(\d+)\/approve$/);
    if (approveMatch && request.method === 'POST') {
      const id = parseInt(approveMatch[1], 10);
      await db.approveEntry(env, id);
      ctx.waitUntil(kv.invalidateEntriesCache(env));
      return json({ success: true });
    }

    const rejectMatch = path.match(/^\/api\/admin\/entries\/(\d+)\/reject$/);
    if (rejectMatch && request.method === 'POST') {
      const id = parseInt(rejectMatch[1], 10);
      await db.rejectEntry(env, id);
      ctx.waitUntil(kv.invalidateEntriesCache(env));
      return json({ success: true });
    }

    const deleteMatch = path.match(/^\/api\/admin\/entries\/(\d+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const id = parseInt(deleteMatch[1], 10);
      await db.deleteEntry(env, id);
      ctx.waitUntil(kv.invalidateEntriesCache(env));
      return json({ success: true });
    }

    return json({ error: 'Not found' }, 404);
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleQueue(batch, env, ctx);
  },
};
