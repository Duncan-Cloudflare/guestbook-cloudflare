import type { Env, GuestbookEntry } from './types';

const CACHE_KEY = 'entries:approved';
const CACHE_TTL_SECONDS = 60;

export async function getCachedEntries(env: Env): Promise<GuestbookEntry[] | null> {
  const cached = await env.GUESTBOOK_CACHE.get(CACHE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as GuestbookEntry[];
  } catch {
    return null;
  }
}

export async function setCachedEntries(env: Env, entries: GuestbookEntry[]): Promise<void> {
  await env.GUESTBOOK_CACHE.put(CACHE_KEY, JSON.stringify(entries), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
}

export async function invalidateEntriesCache(env: Env): Promise<void> {
  await env.GUESTBOOK_CACHE.delete(CACHE_KEY);
}
