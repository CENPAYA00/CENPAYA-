-- CenPaya D1 migration 69
-- Private, user-owned collections for saved posts and videos.

CREATE TABLE IF NOT EXISTS post_saved_folders (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_saved_folders_user_name
  ON post_saved_folders(user_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_post_saved_folders_user_created
  ON post_saved_folders(user_id, created_at);

CREATE TABLE IF NOT EXISTS post_saved_folder_items (
  user_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (folder_id, post_id),
  FOREIGN KEY (folder_id, user_id) REFERENCES post_saved_folders(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_saved_folder_items_user_folder
  ON post_saved_folder_items(user_id, folder_id, created_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (69, 'saved_post_and_video_folders');
