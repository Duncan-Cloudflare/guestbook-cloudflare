-- Guestbook demo schema
-- Services: D1 tables for entries, moderation log, and queue event audit

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('pending', 'approved', 'rejected', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);

CREATE TABLE IF NOT EXISTS moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  CHECK (action IN ('approve', 'reject', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_entry_id ON moderation_log(entry_id);

CREATE TABLE IF NOT EXISTS queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER,
  event_type TEXT NOT NULL,
  processed_at DATETIME,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_events_entry_id ON queue_events(entry_id);
