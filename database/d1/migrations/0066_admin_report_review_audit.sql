-- Durable audit trail for administrator report decisions and notes.
CREATE TABLE IF NOT EXISTS admin_report_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  report_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','listing','user','message','group')),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('under_review','resolved','dismissed')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (note IS NULL OR length(note) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_admin_report_reviews_report
  ON admin_report_reviews(target_type,report_id,created_at DESC);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (66,'admin_report_review_audit');
