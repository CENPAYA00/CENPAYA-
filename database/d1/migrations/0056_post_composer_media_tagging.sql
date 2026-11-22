-- Cenpaya D1 migration 56
-- Completes the existing frontend post composer using the exported post_media table.

ALTER TABLE posts ADD COLUMN background_id TEXT;
ALTER TABLE posts ADD COLUMN feeling TEXT;
ALTER TABLE posts ADD COLUMN feeling_emoji TEXT;
ALTER TABLE posts ADD COLUMN feeling_kind TEXT
  CHECK (feeling_kind IS NULL OR feeling_kind IN ('feeling','activity'));

ALTER TABLE notifications ADD COLUMN link_url TEXT
  CHECK (
    link_url IS NULL OR (
      length(link_url) <= 300
      AND substr(link_url,1,1) = '/'
      AND substr(link_url,1,2) <> '//'
    )
  );

CREATE TABLE IF NOT EXISTS post_tagged_users (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL,
  tagged_user_id TEXT NOT NULL,
  tagged_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tagged_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (post_id, tagged_user_id),
  CHECK (tagged_user_id <> tagged_by_user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tagged_users_tagged_user
  ON post_tagged_users(tagged_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_tagged_users_post
  ON post_tagged_users(post_id, created_at);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (56, 'post_composer_media_tagging_and_notification_links');
