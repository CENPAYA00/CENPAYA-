-- Durable D1-backed processing queue. Jobs survive Worker restarts and are retried.
CREATE TABLE IF NOT EXISTS video_processing_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 video_id TEXT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(video_id)
);
CREATE INDEX IF NOT EXISTS idx_video_processing_queue ON video_processing_jobs(status,created_at);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name) VALUES(59,'durable_video_processing_queue');
