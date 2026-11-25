-- D1 migration 0070: member video ratings.
CREATE TABLE IF NOT EXISTS video_ratings (
  video_id TEXT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_video_ratings_user_created ON video_ratings(user_id, created_at DESC);
INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (70, 'video_star_ratings');
