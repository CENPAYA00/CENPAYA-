-- D1 migration 0071: unique public video views per signed-in account.
-- A video is counted once per account, on the first valid watch event.

CREATE TABLE IF NOT EXISTS video_views (
  video_id TEXT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_views_user_created
  ON video_views(user_id, created_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (71, 'unique_video_views');
