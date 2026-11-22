-- Cenpaya D1 migration 53
-- Persist privacy and notification choices exposed by the current frontend.

ALTER TABLE user_privacy_settings
  ADD COLUMN tagging_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (tagging_visibility IN ('everyone','followers','friends','nobody'));

ALTER TABLE user_privacy_settings
  ADD COLUMN mentioning_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (mentioning_visibility IN ('everyone','followers','friends','nobody'));

ALTER TABLE user_privacy_settings
  ADD COLUMN default_post_visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (default_post_visibility IN ('public','followers','friends','private'));

ALTER TABLE notification_preferences
  ADD COLUMN sms_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (sms_enabled IN (0,1));

ALTER TABLE notification_preferences
  ADD COLUMN order_notifications_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (order_notifications_enabled IN (0,1));

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (53, 'worker_social_preferences');
