-- D1 Worker maintenance monitor state. Queue jobs remain on the existing one-minute trigger.
CREATE TABLE IF NOT EXISTS cenpaya_worker_maintenance_state (
  task_key TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'never',
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO cenpaya_worker_maintenance_state (task_key,last_status)
VALUES ('database_keepalive','never');
