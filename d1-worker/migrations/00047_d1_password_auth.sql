-- CenPaya D1 migration 47: D1-owned password authentication.
-- Existing accounts are not assigned a password; users must complete the
-- account-recovery / password-setup flow before password sign-in.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_lower
  ON users(lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower
  ON users(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone
  ON users(phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_login
  ON users(lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone_login
  ON users(phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;

INSERT INTO cenpaya_migrations (version, migration_name)
VALUES (47, 'd1_password_auth')
ON CONFLICT(version) DO NOTHING;
