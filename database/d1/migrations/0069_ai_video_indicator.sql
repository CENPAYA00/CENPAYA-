-- AI Indicator results for sampled frames from marketplace and social video uploads.
-- Advisory only: results never change publication, moderation, or account status.
CREATE TABLE IF NOT EXISTS ai_video_indicator_results (
  video_id TEXT PRIMARY KEY REFERENCES video_assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed','unavailable')),
  classification TEXT NOT NULL CHECK (classification IN ('possible_ai_generated','no_clear_signal','inconclusive')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reason TEXT NOT NULL DEFAULT '',
  model TEXT,
  sampled_frames INTEGER NOT NULL DEFAULT 0 CHECK (sampled_frames >= 0 AND sampled_frames <= 5),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_video_indicator_updated
  ON ai_video_indicator_results(updated_at DESC);
