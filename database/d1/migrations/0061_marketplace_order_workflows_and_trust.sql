-- Non-financial marketplace workflow records. Financial truth remains in the Supabase Worker.
CREATE TABLE IF NOT EXISTS marketplace_order_workflows (
  order_id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  listing_id TEXT,
  order_type TEXT NOT NULL CHECK(order_type IN ('goods','freelance')),
  financial_status TEXT NOT NULL DEFAULT 'pending',
  workflow_status TEXT NOT NULL DEFAULT 'in_progress',
  chat_thread_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_workflows_buyer ON marketplace_order_workflows(buyer_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_order_workflows_seller ON marketplace_order_workflows(seller_id,updated_at);

CREATE TABLE IF NOT EXISTS marketplace_order_deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  delivery_note TEXT NOT NULL,
  delivery_links_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','revision_requested','superseded')),
  ai_disclosure TEXT NOT NULL DEFAULT 'unknown' CHECK(ai_disclosure IN ('human_created','ai_assisted','primarily_ai_generated','unknown')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(order_id,version)
);
CREATE INDEX IF NOT EXISTS idx_order_deliveries_order ON marketplace_order_deliveries(order_id,version);

CREATE TABLE IF NOT EXISTS marketplace_order_delivery_files (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  r2_object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_delivery_files_delivery ON marketplace_order_delivery_files(delivery_id);

CREATE TABLE IF NOT EXISTS marketplace_order_reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  listing_id TEXT,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  communication_rating INTEGER CHECK(communication_rating BETWEEN 1 AND 5),
  quality_rating INTEGER CHECK(quality_rating BETWEEN 1 AND 5),
  timeliness_rating INTEGER CHECK(timeliness_rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','under_review')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_reviews_seller ON marketplace_order_reviews(seller_id,status,created_at);

CREATE TABLE IF NOT EXISTS marketplace_trust_disclosures (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  listing_id TEXT,
  user_id TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK(content_kind IN ('text','image','document','delivery')),
  content_purpose TEXT NOT NULL CHECK(content_purpose IN ('product_presentation','actual_product_photo','proof_of_condition','proof_of_shipment','freelance_work','other')),
  ai_disclosure TEXT NOT NULL CHECK(ai_disclosure IN ('human_created','ai_assisted','primarily_ai_generated','unknown')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_trust_disclosures_order ON marketplace_trust_disclosures(order_id,created_at);

CREATE TABLE IF NOT EXISTS marketplace_trust_scans (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  listing_id TEXT,
  subject_user_id TEXT NOT NULL,
  content_hash TEXT,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT,
  signal_type TEXT NOT NULL,
  score REAL,
  result_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','failed','needs_human_review')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_trust_scans_order ON marketplace_trust_scans(order_id,created_at);

CREATE TABLE IF NOT EXISTS marketplace_order_chat_links (
  order_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  linked_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS marketplace_order_event_receipts (
  event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
