-- CenPaya D1 migration 0083: persistent staff task progress notes and evidence.
-- Prepared in source control only; do not apply until the D1 rollout is approved.

CREATE TABLE IF NOT EXISTS staff_task_updates (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES staff_tasks(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  update_type TEXT NOT NULL CHECK (update_type IN ('progress','evidence','completion')),
  body TEXT CHECK (body IS NULL OR length(body) <= 5000),
  attachment_url TEXT CHECK (attachment_url IS NULL OR (length(attachment_url) <= 2048 AND attachment_url LIKE 'https://%')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_task_updates_task_created
  ON staff_task_updates(task_id,created_at);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (83,'staff_task_progress_updates');
