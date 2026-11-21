-- Cenpaya D1 migration 52
-- Adds the two Google OAuth persistence tables required by d1-worker/src/index.ts.
-- Registration profile/consent fields are stored on users (the exported schema
-- already contains gender, date_of_birth, preferred_language and terms_accepted_at).

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
VALUES (52, 'oauth_worker_identity_support');
