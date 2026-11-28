-- Staff workspace identities are kept separate from customer account roles.
CREATE TABLE IF NOT EXISTS staff_workspace_members (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_role TEXT NOT NULL CHECK (workspace_role IN ('staff_member')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_workspace_members_active
  ON staff_workspace_members(is_active,workspace_role);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (65,'staff_workspace_identity_projection');
