-- Independent per-person staff queues and assignment ownership.
ALTER TABLE support_tickets ADD COLUMN assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_status ON support_tickets(assigned_to_user_id,status,updated_at DESC);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name) VALUES(62,'individual_staff_workspaces');