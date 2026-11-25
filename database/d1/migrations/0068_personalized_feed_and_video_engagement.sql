-- Cenpaya D1 migration 68
-- Persist privacy-conscious engagement events and lightweight interest signals for feed ranking.

CREATE TABLE IF NOT EXISTS post_engagement_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','dwell','video_watch','video_complete','skip','like','comment','save','share')),
  dwell_ms INTEGER NOT NULL DEFAULT 0 CHECK (dwell_ms BETWEEN 0 AND 300000),
  watch_ms INTEGER NOT NULL DEFAULT 0 CHECK (watch_ms BETWEEN 0 AND 300000),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  source TEXT NOT NULL DEFAULT 'feed' CHECK (source IN ('feed','videos','search','profile','shared')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_post_engagement_user_created
  ON post_engagement_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_engagement_post_type
  ON post_engagement_events(post_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS user_interest_signals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL CHECK (length(topic_key) BETWEEN 3 AND 28),
  score REAL NOT NULL DEFAULT 0 CHECK (score BETWEEN -100 AND 100),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_user_interest_ranking
  ON user_interest_signals(user_id, score DESC, updated_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (68, 'personalized_feed_and_video_engagement');
