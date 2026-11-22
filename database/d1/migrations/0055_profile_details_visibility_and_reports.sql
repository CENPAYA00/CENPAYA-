-- Cenpaya D1 migration 55
-- Adds profile-detail visibility and report targets missing from the 2026-11-21 export.

CREATE TABLE IF NOT EXISTS user_profile_details_visibility (
  user_id TEXT PRIMARY KEY NOT NULL,
  bio TEXT NOT NULL DEFAULT 'public' CHECK (bio IN ('public','followers','private')),
  phone TEXT NOT NULL DEFAULT 'followers' CHECK (phone IN ('public','followers','private')),
  email TEXT NOT NULL DEFAULT 'private' CHECK (email IN ('public','followers','private')),
  joined TEXT NOT NULL DEFAULT 'public' CHECK (joined IN ('public','followers','private')),
  occupation TEXT NOT NULL DEFAULT 'public' CHECK (occupation IN ('public','followers','private')),
  location TEXT NOT NULL DEFAULT 'followers' CHECK (location IN ('public','followers','private')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reported_user_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate_speech','violence','nudity','misinformation','scam','impersonation','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (reported_user_id, reporter_id),
  CHECK (reported_user_id <> reporter_id),
  CHECK (details IS NULL OR length(trim(details)) BETWEEN 1 AND 2000)
);

CREATE TABLE IF NOT EXISTS chat_message_reports (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate_speech','violence','nudity','misinformation','scam','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (message_id, reporter_id),
  CHECK (details IS NULL OR length(trim(details)) BETWEEN 1 AND 2000)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY NOT NULL,
  community_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate_speech','violence','misinformation','inappropriate_content','scam','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (community_id, reporter_id),
  CHECK (details IS NULL OR length(trim(details)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status_created
  ON user_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_message_reports_status_created
  ON chat_message_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_community_reports_status_created
  ON community_reports(status, created_at);

INSERT OR IGNORE INTO cenpaya_migrations(version, migration_name)
VALUES (55, 'profile_details_visibility_and_extended_reports');
