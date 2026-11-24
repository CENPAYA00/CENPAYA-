-- Secure metadata for private R2 document attachments in chat and social posts.
CREATE TABLE IF NOT EXISTS chat_message_attachments (
 id TEXT PRIMARY KEY NOT NULL,message_id TEXT NOT NULL,thread_id TEXT NOT NULL,sender_id TEXT NOT NULL,
 r2_object_key TEXT NOT NULL UNIQUE,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,
 file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes>0 AND file_size_bytes<=104857600),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
 FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
 FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_message_attachments_message ON chat_message_attachments(message_id,created_at);
CREATE TABLE IF NOT EXISTS post_attachments (
 id TEXT PRIMARY KEY NOT NULL,post_id TEXT NOT NULL,owner_id TEXT NOT NULL,r2_object_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,mime_type TEXT NOT NULL,
 file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes>0 AND file_size_bytes<=104857600),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_attachments_post ON post_attachments(post_id,created_at);
INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name) VALUES(60,'secure_chat_and_social_document_attachments');
