-- Cenpaya D1 migration 54
-- Persist direct-chat display settings, support read state, and hidden-feed choices.

ALTER TABLE chat_thread_members
  ADD COLUMN chat_theme TEXT NOT NULL DEFAULT 'emerald'
  CHECK (chat_theme IN ('emerald','ocean','sunset','midnight'));

ALTER TABLE chat_thread_members
  ADD COLUMN disappearing_seconds INTEGER
  CHECK (disappearing_seconds IS NULL OR disappearing_seconds BETWEEN 60 AND 2592000);

ALTER TABLE support_tickets ADD COLUMN user_last_read_at TEXT;
ALTER TABLE support_tickets ADD COLUMN support_last_read_at TEXT;

CREATE TABLE IF NOT EXISTS user_feed_post_preferences (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('interested','not_interested')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (54, 'worker_chat_support_and_feed_preferences');
