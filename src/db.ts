import type { Env, GuestbookEntry } from './types';

export async function createEntry(env: Env, name: string, message: string): Promise<GuestbookEntry> {
  const result = await env.DB.prepare(
    `INSERT INTO entries (name, message, status) VALUES (?, ?, 'pending') RETURNING *`
  )
    .bind(name, message)
    .first<GuestbookEntry>();
  if (!result) throw new Error('Failed to create entry');
  return result;
}

export async function getApprovedEntries(env: Env): Promise<GuestbookEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM entries WHERE status = 'approved' ORDER BY created_at DESC`
  ).all<GuestbookEntry>();
  return results ?? [];
}

export async function getAllEntries(env: Env): Promise<GuestbookEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM entries ORDER BY created_at DESC`
  ).all<GuestbookEntry>();
  return results ?? [];
}

export async function approveEntry(env: Env, id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE entries SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id),
    env.DB.prepare(`INSERT INTO moderation_log (entry_id, action) VALUES (?, 'approve')`).bind(id),
  ]);
}

export async function rejectEntry(env: Env, id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE entries SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id),
    env.DB.prepare(`INSERT INTO moderation_log (entry_id, action) VALUES (?, 'reject')`).bind(id),
  ]);
}

export async function deleteEntry(env: Env, id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE entries SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(id),
    env.DB.prepare(`INSERT INTO moderation_log (entry_id, action) VALUES (?, 'delete')`).bind(id),
  ]);
}

export async function logQueueEvent(
  env: Env,
  entryId: number | null,
  eventType: string,
  result: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO queue_events (entry_id, event_type, processed_at, result) VALUES (?, ?, CURRENT_TIMESTAMP, ?)`
  )
    .bind(entryId, eventType, result)
    .run();
}
