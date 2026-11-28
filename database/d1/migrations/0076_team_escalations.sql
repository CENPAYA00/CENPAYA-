-- CenPaya D1 migration 0076: role-based team escalations.
-- Prepared in source control only; do not apply until the D1 rollout is approved.

CREATE TABLE IF NOT EXISTS team_escalations (
  id TEXT PRIMARY KEY NOT NULL,
  raised_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_role TEXT NOT NULL CHECK (target_role IN ('support_agent','vice_admin','super_admin','owner')),
  ticket_id TEXT REFERENCES support_tickets(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES staff_tasks(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  resolution_note TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_team_escalations_role_status
  ON team_escalations(target_role,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_escalations_raiser
  ON team_escalations(raised_by_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_escalations_ticket
  ON team_escalations(ticket_id,status);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (76,'team_escalations');
