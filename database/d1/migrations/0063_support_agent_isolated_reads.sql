-- Per-agent read cursors keep unread counts private to each support agent.
CREATE TABLE IF NOT EXISTS support_ticket_staff_reads (
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_staff_reads_user
  ON support_ticket_staff_reads(user_id, last_read_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (63, 'support_agent_isolated_reads');
