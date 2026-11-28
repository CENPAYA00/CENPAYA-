-- CenPaya D1 migration 0074
-- Unified, provider-independent team appointments for Support Agents, Staff Members and Vice Admins.
-- This migration is prepared in source control only; it is not applied to a live database.

CREATE TABLE IF NOT EXISTS team_workspace_members (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_role TEXT NOT NULL CHECK (workspace_role IN ('support_agent','staff_member','vice_admin')),
  appointment_title TEXT NOT NULL CHECK (length(trim(appointment_title)) BETWEEN 2 AND 100),
  responsibilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(responsibilities_json)),
  permissions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions_json)),
  supervisor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  appointed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  appointed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_team_workspace_role_status
  ON team_workspace_members(workspace_role,status,appointed_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_workspace_supervisor
  ON team_workspace_members(supervisor_user_id,status);

CREATE TABLE IF NOT EXISTS team_workspace_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  workspace_role TEXT NOT NULL CHECK (workspace_role IN ('support_agent','staff_member','vice_admin')),
  appointment_title TEXT NOT NULL CHECK (length(trim(appointment_title)) BETWEEN 2 AND 100),
  responsibilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(responsibilities_json)),
  permissions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions_json)),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supervisor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT,
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_email_status
  ON team_workspace_invitations(email,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_invitations_expiry
  ON team_workspace_invitations(status,expires_at);

CREATE TABLE IF NOT EXISTS team_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 2 AND 80),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_team_audit_target_created
  ON team_audit_logs(target_user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_audit_actor_created
  ON team_audit_logs(actor_user_id,created_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (74,'team_workspaces_invitations_and_audit');
