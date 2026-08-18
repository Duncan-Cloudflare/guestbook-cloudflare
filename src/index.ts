import type { Env, QueueMessage } from './types';
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/')) {
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
        } catch {
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
    }

    // All non-API routes are served by the static assets binding.
    return env.ASSETS.fetch(request);
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleQueue(batch, env, ctx);
  },
};
