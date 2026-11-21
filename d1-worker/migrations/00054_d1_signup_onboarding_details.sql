-- CenPaya D1 migration 54: persist signup onboarding and terms acceptance.
-- Kept separate from users so the D1 identity schema remains additive and portable.
CREATE TABLE IF NOT EXISTS user_onboarding_details (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  terms_version TEXT NOT NULL DEFAULT 'v1.0',
  terms_accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO cenpaya_migrations (version, migration_name)
VALUES (54, 'd1_signup_onboarding_details')
ON CONFLICT(version) DO NOTHING;
