-- CenPaya D1 migration 72
-- A single Owner/Super Admin-controlled master switch for all video surfaces.
-- Existing installations start with video disabled until explicitly enabled.
INSERT OR IGNORE INTO feature_flags(key, enabled) VALUES ('video_global', 0);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (72, 'global_video_feature_switch');
