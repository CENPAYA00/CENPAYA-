-- CenPaya D1 migration 0075: engineering workspaces and shared internal team chat.
-- Engineering appointments remain independent from users.role.

CREATE TABLE IF NOT EXISTS engineering_appointments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engineering_role TEXT NOT NULL CHECK (engineering_role IN (
    'supabase_engineer','d1_engineer','application_code_engineer','security_engineer','ui_ux_designer'
  )),
  description TEXT NOT NULL,
  is_lead INTEGER NOT NULL DEFAULT 0 CHECK (is_lead IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  appointed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  appointed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  removed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  removed_at TEXT,
  UNIQUE(user_id,engineering_role)
);
CREATE INDEX IF NOT EXISTS idx_engineering_appointments_user_status ON engineering_appointments(user_id,status);
CREATE INDEX IF NOT EXISTS idx_engineering_appointments_role_status ON engineering_appointments(engineering_role,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_engineering_single_active_lead ON engineering_appointments(is_lead) WHERE is_lead=1 AND status='active';

CREATE TABLE IF NOT EXISTS engineering_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=5000),
  assigned_to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supervisor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','submitted','completed','cancelled')),
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_engineering_tasks_assignee_status ON engineering_tasks(assigned_to_user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engineering_tasks_supervisor ON engineering_tasks(supervisor_user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS engineering_task_updates (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES engineering_tasks(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  update_type TEXT NOT NULL CHECK(update_type IN ('comment','status_change','submission','evidence')),
  body TEXT,
  attachment_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_engineering_task_updates_task ON engineering_task_updates(task_id,created_at);

CREATE TABLE IF NOT EXISTS engineering_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_engineering_audit_created ON engineering_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS team_chat_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_type TEXT NOT NULL CHECK(conversation_type IN ('general','direct','group','announcement')),
  title TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_chat_single_general_room ON team_chat_conversations(conversation_type) WHERE conversation_type='general' AND is_archived=0;

CREATE TABLE IF NOT EXISTS team_chat_members (
  conversation_id TEXT NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_read_at TEXT,
  PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_chat_members_user ON team_chat_members(user_id,conversation_id);
CREATE TABLE IF NOT EXISTS team_chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
  attachment_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  edited_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_team_chat_messages_conversation ON team_chat_messages(conversation_id,created_at DESC);

INSERT OR IGNORE INTO cenpaya_migrations(version,migration_name) VALUES(75,'engineering_workspaces_and_team_chat');
