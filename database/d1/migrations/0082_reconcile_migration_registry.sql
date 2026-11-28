-- CenPaya D1 migration 0082
-- Reconcile the application migration registry after resolving duplicate
-- numeric identifiers from the original 0068, 0069 and 0074 filenames.
-- The D1 Wrangler migration ledger tracks filenames independently; this table
-- uses a unique numeric version and must not silently lose migration records.

DELETE FROM cenpaya_migrations
WHERE version=68 AND migration_name='personalized_feed_and_video_engagement';

DELETE FROM cenpaya_migrations
WHERE version=69 AND migration_name='saved_post_and_video_folders';

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name) VALUES
  (68,'ai_indicator'),
  (69,'admin_support_queue_separation'),
  (78,'personalized_feed_and_video_engagement'),
  (79,'ai_video_indicator'),
  (80,'saved_post_and_video_folders'),
  (81,'d1_maintenance_monitor');

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (82,'reconcile_migration_registry');
