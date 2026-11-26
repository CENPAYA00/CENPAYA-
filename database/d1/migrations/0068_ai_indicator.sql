-- AI Indicator results for marketplace products and freelance services.
-- Analysis is advisory only; it never changes listing moderation or publication status.
CREATE TABLE IF NOT EXISTS ai_indicator_results (
  listing_id TEXT PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('product','service')),
  status TEXT NOT NULL CHECK (status IN ('completed','unavailable')),
  classification TEXT NOT NULL CHECK (classification IN ('possible_ai_generated','possible_ai_assisted','no_clear_signal','inconclusive')),
  confidence REAL,
  reason TEXT NOT NULL DEFAULT '',
  model TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_indicator_results_seller_updated
  ON ai_indicator_results(seller_id, updated_at DESC);
