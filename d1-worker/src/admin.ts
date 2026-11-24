import type { Env, User } from "./types.js";
import { uuid } from "./security.js";

type Context = { path: string; method: string; user: User | null };
type FeatureDefinition = {
  key: string;
  display_name: string;
  description: string;
  ready: boolean;
  blocked_reason: string | null;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (message: string, status = 400) => json({ success: false, error: message }, status);

function definitions(env: Env): FeatureDefinition[] {
  const videoReady = !!env.VIDEO_PROCESSOR_TOKEN && (!!env.VIDEO_PROCESSOR || !!env.VIDEO_PROCESSOR_URL);
  return [
    {
      key: "voice_calls",
      display_name: "Voice calls",
      description: "In-app voice calling.",
      ready: true,
      blocked_reason: null,
    },
    {
      key: "video_posts",
      display_name: "Video publishing",
      description: "Upload, process and publish video posts and reels.",
      ready: videoReady,
      blocked_reason: videoReady ? null : "Configure the video processor binding or HTTPS URL and VIDEO_PROCESSOR_TOKEN first.",
    },
    {
      key: "ai_assistant",
      display_name: "AI assistance",
      description: "AI-powered assistance for members.",
      ready: false,
      blocked_reason: "The member-facing AI assistant is not implemented yet. AI Search availability alone does not enable an assistant.",
    },
  ];
}

export async function handleAdminRoutes(
  request: Request,
  env: Env,
  { path, method, user }: Context,
): Promise<Response | null> {
  if (path === "/api/staff/tasks" && method === "GET") {
    if (!user) return fail("Staff Member access required", 403);
    const workspace = await env.DB.prepare("SELECT 1 AS active FROM staff_workspace_members WHERE user_id=? AND is_active=1 AND workspace_role='staff_member'").bind(user.id).first();
    if (!workspace) return fail("Staff Member access required", 403);
    try {
      const rows = await env.DB.prepare(
        "SELECT id,title,description,status,due_at,created_at,updated_at,completed_at FROM staff_tasks WHERE assigned_to_user_id=? ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,COALESCE(due_at,'9999-12-31'),updated_at DESC LIMIT 200"
      ).bind(user.id).all();
      return json({ success: true, data: rows.results });
    } catch { return fail("Staff tasks are unavailable. Apply D1 migration 0064 first.", 503); }
  }

  const staffTask = path.match(/^\/api\/staff\/tasks\/([0-9a-f-]{36})$/i);
  if (staffTask && method === "PATCH") {
    if (!user) return fail("Staff Member access required", 403);
    const workspace = await env.DB.prepare("SELECT 1 AS active FROM staff_workspace_members WHERE user_id=? AND is_active=1 AND workspace_role='staff_member'").bind(user.id).first();
    if (!workspace) return fail("Staff Member access required", 403);
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return fail("JSON body required", 415);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).length !== 1 || !["todo","in_progress","blocked","completed"].includes(String(body.status))) {
      return fail("A valid task status is required");
    }
    const status = String(body.status);
    try {
      const result = await env.DB.prepare(
        "UPDATE staff_tasks SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completed_at=CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE id=? AND assigned_to_user_id=?"
      ).bind(status,status,staffTask[1],user.id).run();
      return result.meta.changes ? json({ success: true }) : fail("Task not found in your workspace", 404);
    } catch { return fail("Could not update task", 503); }
  }

  if (path === "/api/admin/staff/tasks" && method === "GET") {
    if (!user || !["owner","super_admin"].includes(user.role)) return fail("Admin access required", 403);
    try {
      const rows = await env.DB.prepare(
        "SELECT t.id,t.title,t.description,t.status,t.due_at,t.created_at,t.updated_at,t.completed_at,t.assigned_to_user_id,u.username AS assignee_username FROM staff_tasks t JOIN users u ON u.id=t.assigned_to_user_id ORDER BY t.updated_at DESC LIMIT 300"
      ).all();
      return json({ success: true, data: rows.results });
    } catch { return fail("Staff tasks are unavailable. Apply D1 migration 0064 first.", 503); }
  }

  if (path === "/api/admin/staff/tasks" && method === "POST") {
    if (!user || !["owner","super_admin"].includes(user.role)) return fail("Admin access required", 403);
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return fail("JSON body required", 415);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some(key => !["title","description","assigned_to_user_id","due_at"].includes(key))) return fail("Invalid task payload");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const assignee = typeof body.assigned_to_user_id === "string" ? body.assigned_to_user_id : "";
    const dueAt = body.due_at === null || body.due_at === undefined || body.due_at === "" ? null : body.due_at;
    if (title.length < 2 || title.length > 160 || description.length > 5000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignee)) return fail("Valid title, description and staff member are required");
    if (dueAt !== null && (typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)))) return fail("Invalid due date");
    try {
      const target = await env.DB.prepare("SELECT u.id FROM users u JOIN staff_workspace_members w ON w.user_id=u.id WHERE u.id=? AND u.banned=0 AND u.deleted_at IS NULL AND w.workspace_role='staff_member' AND w.is_active=1").bind(assignee).first<{id:string}>();
      if (!target) return fail("Assigned account is not an active Staff Member", 404);
      const id = uuid();
      await env.DB.prepare("INSERT INTO staff_tasks(id,title,description,assigned_to_user_id,created_by_user_id,due_at) VALUES(?,?,?,?,?,?)")
        .bind(id,title,description,assignee,user.id,dueAt ? new Date(String(dueAt)).toISOString() : null).run();
      return json({ success: true, data: { id } }, 201);
    } catch { return fail("Could not create staff task", 503); }
  }

  if (path === "/api/admin/features" && method === "GET") {
    if (!user || !["owner", "super_admin"].includes(user.role)) return fail("Admin access required", 403);
    try {
      const rows = await env.DB.prepare("SELECT key, enabled FROM feature_flags ORDER BY key").all<{ key: string; enabled: number }>();
      const enabledByKey = new Map((rows.results || []).map(row => [row.key, Number(row.enabled) === 1]));
      const data = definitions(env).map(feature => ({
        id: feature.key,
        feature_key: feature.key,
        display_name: feature.display_name,
        description: feature.description,
        ready: feature.ready,
        blocked_reason: feature.blocked_reason,
        is_enabled_globally: enabledByKey.get(feature.key) === true && feature.ready,
      }));
      return json({ success: true, data });
    } catch {
      return fail("Feature settings are unavailable. Apply D1 migration 0057 first.", 503);
    }
  }

  const match = path.match(/^\/api\/admin\/features\/([a-z_]+)$/);
  if (match && method === "PATCH") {
    if (!user || !["owner", "super_admin"].includes(user.role)) return fail("Admin access required", 403);
    const key = match[1];
    const feature = definitions(env).find(item => item.key === key);
    if (!feature) return fail("Unknown feature", 404);

    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return fail("JSON body required", 415);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).length !== 1 || typeof body.is_enabled_globally !== "boolean") {
      return fail("is_enabled_globally must be a boolean");
    }
    if (body.is_enabled_globally && !feature.ready) {
      return fail(feature.blocked_reason || "Feature is not ready to enable", 409);
    }

    try {
      const result = await env.DB.prepare(
        "UPDATE feature_flags SET enabled = ? WHERE key = ?"
      ).bind(body.is_enabled_globally ? 1 : 0, key).run();
      if (!result.meta.changes) return fail("Feature setting not found. Apply D1 migration 0057 first.", 404);
      return json({ success: true, data: { feature_key: key, is_enabled_globally: body.is_enabled_globally } });
    } catch {
      return fail("Could not update feature setting", 503);
    }
  }

  return null;
}
