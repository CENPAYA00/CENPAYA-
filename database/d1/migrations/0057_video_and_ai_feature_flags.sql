-- Cenpaya D1 migration 57
-- Adds centrally controlled, default-off feature switches for video and AI.
-- The existing voice_calls flag is preserved.

INSERT OR IGNORE INTO feature_flags(key, enabled) VALUES
  ('video_posts', 0),
  ('ai_assistant', 0);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (57, 'video_and_ai_feature_flags');
