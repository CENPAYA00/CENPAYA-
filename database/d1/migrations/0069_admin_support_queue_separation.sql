-- Cenpaya D1 migration 69
-- Keep platform-admin requests separate from the support-agent work queue.

ALTER TABLE support_tickets
  ADD COLUMN queue_type TEXT NOT NULL DEFAULT 'support'
  CHECK (queue_type IN ('support','admin'));

CREATE INDEX IF NOT EXISTS idx_support_tickets_queue_assignment
  ON support_tickets(queue_type, assigned_to_user_id, status, updated_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (69, 'admin_support_queue_separation');
