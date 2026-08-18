export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface QueueMessage {
  event: 'new_submission';
  entryId: number;
  name: string;
  message: string;
  submittedAt: string;
}

export interface Env {
  DB: D1Database;
  GUESTBOOK_CACHE: KVNamespace;
  GUESTBOOK_EVENTS: Queue<QueueMessage>;
  ADMIN_SECRET: string;
}
