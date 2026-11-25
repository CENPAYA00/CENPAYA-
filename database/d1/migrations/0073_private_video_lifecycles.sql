-- D1 migration 0073: private video lifecycles for chat, order delivery and listings.
ALTER TABLE video_assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'post'
  CHECK (purpose IN ('post','chat','delivery','listing'));
ALTER TABLE video_assets ADD COLUMN related_id TEXT;
ALTER TABLE video_assets ADD COLUMN max_duration_seconds INTEGER NOT NULL DEFAULT 300
  CHECK (max_duration_seconds BETWEEN 1 AND 300);
ALTER TABLE video_assets ADD COLUMN retention_expires_at TEXT;
ALTER TABLE video_assets ADD COLUMN deleted_at TEXT;
ALTER TABLE chat_messages ADD COLUMN video_asset_id TEXT REFERENCES video_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_video_assets_lifecycle ON video_assets(purpose,retention_expires_at,status);

CREATE TABLE IF NOT EXISTS chat_message_user_deletions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(message_id,user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_order_delivery_videos (
  delivery_id TEXT NOT NULL REFERENCES marketplace_order_deliveries(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  video_id TEXT NOT NULL UNIQUE REFERENCES video_assets(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(delivery_id,video_id)
);
CREATE INDEX IF NOT EXISTS idx_order_delivery_videos_order ON marketplace_order_delivery_videos(order_id);

CREATE TABLE IF NOT EXISTS marketplace_listing_videos (
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL UNIQUE REFERENCES video_assets(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(listing_id,video_id)
);
ALTER TABLE marketplace_listings ADD COLUMN sale_state TEXT NOT NULL DEFAULT 'available'
  CHECK (sale_state IN ('available','sold'));
ALTER TABLE marketplace_listings ADD COLUMN sold_at TEXT;
ALTER TABLE marketplace_listings ADD COLUMN purge_after TEXT;
ALTER TABLE marketplace_listings ADD COLUMN media_purged_at TEXT;
CREATE INDEX IF NOT EXISTS idx_marketplace_listing_retention ON marketplace_listings(sale_state,purge_after,deleted_at);

CREATE TABLE IF NOT EXISTS video_cleanup_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL UNIQUE REFERENCES video_assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_video_cleanup_queue ON video_cleanup_jobs(status,updated_at);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name)
VALUES (73,'private_video_lifecycle_chat_delivery_marketplace');
