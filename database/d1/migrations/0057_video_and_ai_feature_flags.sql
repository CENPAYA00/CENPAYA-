-- Cenpaya D1 migration 57
-- Ensure the feature-flag storage contract used by the Worker exists.
-- Existing installations keep their current values; new installations start disabled.
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);

INSERT OR IGNORE INTO feature_flags(key, enabled) VALUES
  ('voice_calls', 0),
  ('video_posts', 0),
  ('ai_assistant', 0);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (57, 'video_and_ai_feature_flags');
