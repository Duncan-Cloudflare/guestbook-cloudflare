import type { Env, QueueMessage } from './types';
import * as db from './db';
import * as kv from './kv';

// Demo-only moderation words. In a real app this would be a real service.
const BANNED_WORDS = ['spam', 'scam', 'xxx'];

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    const { event, entryId, message: text } = message.body;

    try {
      if (event === 'new_submission') {
        const lowerText = text.toLowerCase();
        const hasBannedWord = BANNED_WORDS.some((word) => lowerText.includes(word));

        if (hasBannedWord) {
          await db.rejectEntry(env, entryId);
          await db.logQueueEvent(env, entryId, 'auto_rejected', 'banned word detected');
        } else {
          // Auto-approve for demo purposes so the public page populates quickly.
          // In production this would remain pending until a moderator approves.
          await db.approveEntry(env, entryId);
          await db.logQueueEvent(env, entryId, 'auto_approved', 'passed basic check');
          ctx.waitUntil(kv.invalidateEntriesCache(env));
        }
      }

      message.ack();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'unknown error';
      await db.logQueueEvent(env, entryId, event, `error: ${errorMessage}`);
      message.retry();
    }
  }
}
