-- Cenpaya D1 migration 52
-- Reconciles the exported 2026-11-21 schema with the D1 Worker's auth routes.
-- The export has no password_hash column or OAuth persistence tables.
-- Registration profile/consent fields already exist on users, so no
-- user_onboarding_details table is needed.

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_updated_at TEXT;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
  ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user_id
  ON oauth_identities(user_id);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (52, 'worker_auth_schema_reconciliation');
