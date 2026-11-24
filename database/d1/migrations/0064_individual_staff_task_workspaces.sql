-- Individual staff workspaces and auditable task assignments.
CREATE TABLE IF NOT EXISTS staff_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  assigned_to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','completed')),
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_assignee_status
  ON staff_tasks(assigned_to_user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_creator
  ON staff_tasks(created_by_user_id,created_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (64,'individual_staff_task_workspaces');
