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
      key: "video_global",
      display_name: "All video features",
      description: "Master switch for video uploads, chat videos, delivery evidence, marketplace videos, posts, and playback.",
      ready: videoReady,
      blocked_reason: videoReady ? null : "Configure the video processor binding or HTTPS URL and VIDEO_PROCESSOR_TOKEN first.",
    },
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
      ready: typeof env.AI?.run === "function",
      blocked_reason: typeof env.AI?.run === "function" ? null : "Bind Workers AI to this D1 Worker before enabling CenPaya Assistant.",
    },
  ];
}

async function getTeamTaskContext(env: Env, user: User) {
  const isAdmin = ["owner", "super_admin"].includes(user.role);
  const appointment = await env.DB.prepare(
    "SELECT workspace_role,permissions_json,supervisor_user_id FROM team_workspace_members WHERE user_id=? AND status='active'"
  ).bind(user.id).first<{workspace_role:string;permissions_json:string;supervisor_user_id:string|null}>().catch(() => null);
  let permissions: string[] = [];
  try { permissions = JSON.parse(appointment?.permissions_json || "[]"); } catch { permissions = []; }
  const role = isAdmin ? user.role : appointment?.workspace_role || user.role;
  const canAssign = isAdmin ||
    (role === "vice_admin" && permissions.includes("can_manage_tasks")) ||
    (role === "support_agent" && permissions.includes("can_supervise_staff"));
  return { isAdmin, role, permissions, supervisorUserId: appointment?.supervisor_user_id || null, canAssign };
}

export async function handleAdminRoutes(
  request: Request,
  env: Env,
  { path, method, user }: Context,
): Promise<Response | null> {
  if (path === "/api/team/escalations" && method === "POST") {
    if (!user) return fail("Team authentication required",401);
    const access = await getTeamTaskContext(env,user);
    const allowedTargets: Record<string,string[]> = {
      support_agent:["vice_admin","super_admin","owner"],
      vice_admin:["super_admin","owner"],
      staff_member:["support_agent","vice_admin"],
      owner:["support_agent","vice_admin","super_admin","owner"],
      super_admin:["support_agent","vice_admin","super_admin","owner"],
    };
    const body = await request.json().catch(() => null) as Record<string,unknown>|null;
    const targetRole = typeof body?.target_role === "string" ? body.target_role : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const ticketId = typeof body?.ticket_id === "string" ? body.ticket_id : null;
    const taskId = typeof body?.task_id === "string" ? body.task_id : null;
    if (!body || Object.keys(body).some(key => !["target_role","reason","ticket_id","task_id"].includes(key)) ||
        !allowedTargets[access.role]?.includes(targetRole) || reason.length<5 || reason.length>2000 ||
        (ticketId && !/^[0-9a-f-]{36}$/i.test(ticketId)) || (taskId && !/^[0-9a-f-]{36}$/i.test(taskId))) {
      return fail("Invalid escalation details or escalation target");
    }
    try {
      const targetExists = ["owner","super_admin"].includes(targetRole)
        ? await env.DB.prepare("SELECT 1 AS active FROM users WHERE role=? AND banned=0 AND deleted_at IS NULL LIMIT 1").bind(targetRole).first()
        : await env.DB.prepare("SELECT 1 AS active FROM team_workspace_members WHERE workspace_role=? AND status='active' LIMIT 1").bind(targetRole).first();
      if (!targetExists) return fail("No active team member is available for this escalation level",409);
      if (ticketId) {
        const ticket = await env.DB.prepare("SELECT id,assigned_to_user_id FROM support_tickets WHERE id=?").bind(ticketId).first<{id:string;assigned_to_user_id:string|null}>();
        if (!ticket) return fail("Escalated support ticket was not found",404);
        if (access.role === "support_agent" && ticket.assigned_to_user_id !== user.id) return fail("You can escalate only a ticket assigned to you",403);
      }
      if (taskId) {
        const task = await env.DB.prepare("SELECT id,assigned_to_user_id,created_by_user_id FROM staff_tasks WHERE id=?").bind(taskId).first<{id:string;assigned_to_user_id:string;created_by_user_id:string}>();
        if (!task) return fail("Escalated task was not found",404);
        if (!access.isAdmin && task.created_by_user_id !== user.id && task.assigned_to_user_id !== user.id) return fail("Task is outside your escalation scope",403);
      }
      const id = uuid();
      await env.DB.prepare("INSERT INTO team_escalations(id,raised_by_user_id,target_role,ticket_id,task_id,reason) VALUES(?,?,?,?,?,?)")
        .bind(id,user.id,targetRole,ticketId,taskId,reason).run();
      await env.DB.prepare("INSERT INTO team_audit_logs(id,actor_user_id,target_user_id,action,details_json) VALUES(?,?,?,?,?)")
        .bind(uuid(),user.id,null,"team_escalation_raised",JSON.stringify({escalation_id:id,target_role:targetRole,ticket_id:ticketId,task_id:taskId})).run().catch(() => {});
      return json({success:true,data:{id}},201);
    } catch { return fail("Escalations are unavailable. Apply D1 migration 0076.",503); }
  }

  if (path === "/api/team/escalations" && method === "GET") {
    if (!user) return fail("Team authentication required",401);
    const access = await getTeamTaskContext(env,user);
    const isSupervisor = access.isAdmin || access.role === "vice_admin" && access.permissions.includes("can_manage_escalations");
    try {
      const where = access.isAdmin ? "" : isSupervisor ? "WHERE e.target_role='vice_admin' OR e.raised_by_user_id=?" : "WHERE e.raised_by_user_id=?";
      const rows = access.isAdmin
        ? await env.DB.prepare("SELECT e.*,u.username AS raised_by_username,t.subject AS ticket_subject FROM team_escalations e JOIN users u ON u.id=e.raised_by_user_id LEFT JOIN support_tickets t ON t.id=e.ticket_id ORDER BY CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,e.created_at DESC LIMIT 200").all()
        : await env.DB.prepare("SELECT e.*,u.username AS raised_by_username,t.subject AS ticket_subject FROM team_escalations e JOIN users u ON u.id=e.raised_by_user_id LEFT JOIN support_tickets t ON t.id=e.ticket_id "+where+" ORDER BY CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,e.created_at DESC LIMIT 200").bind(user.id).all();
      return json({success:true,data:{ok:true,escalations:rows.results||[]}});
    } catch { return fail("Escalation queue is unavailable. Apply D1 migration 0076.",503); }
  }

  const escalationMatch = path.match(/^\/api\/team\/escalations\/([0-9a-f-]{36})$/i);
  if (escalationMatch && method === "PATCH") {
    if (!user) return fail("Team authentication required",401);
    const access = await getTeamTaskContext(env,user);
    if (!(access.isAdmin || access.role === "vice_admin" && access.permissions.includes("can_manage_escalations"))) return fail("Escalation review permission required",403);
    const body = await request.json().catch(() => null) as Record<string,unknown>|null;
    const status = typeof body?.status === "string" ? body.status : "";
    const note = typeof body?.resolution_note === "string" ? body.resolution_note.trim() : "";
    if (!body || Object.keys(body).some(key => !["status","resolution_note"].includes(key)) ||
        !["in_progress","resolved"].includes(status) || (status === "resolved" && (note.length < 3 || note.length > 2000))) return fail("Valid escalation status and resolution note are required");
    const escalation = await env.DB.prepare("SELECT id,target_role FROM team_escalations WHERE id=?").bind(escalationMatch[1]).first<{id:string;target_role:string}>();
    if (!escalation) return fail("Escalation not found",404);
    if (!access.isAdmin && escalation.target_role !== "vice_admin") return fail("This escalation is outside your authority",403);
    await env.DB.prepare("UPDATE team_escalations SET status=?,resolution_note=?,resolved_by_user_id=CASE WHEN ?='resolved' THEN ? ELSE resolved_by_user_id END,resolved_at=CASE WHEN ?='resolved' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(status,note||null,status,user.id,status,escalation.id).run();
    await env.DB.prepare("INSERT INTO team_audit_logs(id,actor_user_id,target_user_id,action,details_json) VALUES(?,?,?,?,?)")
      .bind(uuid(),user.id,null,"team_escalation_updated",JSON.stringify({escalation_id:escalation.id,status})).run().catch(() => {});
    return json({success:true});
  }

  if (path === "/api/team/workspace/overview" && method === "GET") {
    if (!user) return fail("Team authentication required",401);
    const access = await getTeamTaskContext(env,user);
    const canView = access.isAdmin || access.role === "vice_admin" && access.permissions.includes("can_view_team_metrics");
    if (!canView) return fail("Team metrics permission required",403);
    const scoped = !access.isAdmin;
    const tasksWhere = scoped
      ? "WHERE (t.assigned_to_user_id IN (SELECT user_id FROM team_workspace_members WHERE supervisor_user_id=? AND status='active') OR t.created_by_user_id=?)"
      : "";
    const ticketWhere = scoped
      ? "WHERE t.assigned_to_user_id IN (SELECT user_id FROM team_workspace_members WHERE supervisor_user_id=? AND status='active' AND workspace_role='support_agent')"
      : "";
    const taskBinds = scoped ? [user.id,user.id] : [];
    const ticketBinds = scoped ? [user.id] : [];
    try {
      const [memberCount,pendingInvites,taskCounts,ticketCount,performance,recentTasks,recentTickets,audit] = await Promise.all([
        scoped
          ? env.DB.prepare("SELECT COUNT(*) AS total FROM team_workspace_members WHERE supervisor_user_id=? AND status='active'").bind(user.id).first<any>()
          : env.DB.prepare("SELECT (SELECT COUNT(*) FROM team_workspace_members WHERE status='active') + (SELECT COUNT(*) FROM staff_workspace_members WHERE is_active=1 AND user_id NOT IN (SELECT user_id FROM team_workspace_members WHERE status='active')) AS total").first<any>(),
        scoped
          ? env.DB.prepare("SELECT COUNT(*) AS total FROM team_workspace_invitations WHERE invited_by_user_id=? AND status='pending'").bind(user.id).first<any>()
          : env.DB.prepare("SELECT COUNT(*) AS total FROM team_workspace_invitations WHERE status='pending'").first<any>(),
        env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status NOT IN ('completed','cancelled') AND due_at IS NOT NULL AND due_at<strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END) AS overdue,SUM(CASE WHEN status='completed' AND date(completed_at)=date('now') THEN 1 ELSE 0 END) AS completed_today,SUM(CASE WHEN status='completed' AND completed_at>=datetime('now','-7 days') THEN 1 ELSE 0 END) AS completed_week,SUM(CASE WHEN status='completed' AND completed_at>=datetime('now','start of month') THEN 1 ELSE 0 END) AS completed_month FROM staff_tasks t "+tasksWhere).bind(...taskBinds).first<any>(),
        env.DB.prepare("SELECT COUNT(*) AS total FROM support_tickets t "+ticketWhere+" "+(scoped?"AND ":"WHERE ")+"t.status IN ('open','in_progress','waiting','waiting_for_user')").bind(...ticketBinds).first<any>(),
        env.DB.prepare("SELECT u.id AS user_id,u.username,COUNT(t.id) AS assigned,SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN t.status NOT IN ('completed','cancelled') AND t.due_at IS NOT NULL AND t.due_at<strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END) AS overdue FROM staff_tasks t JOIN users u ON u.id=t.assigned_to_user_id "+tasksWhere+" GROUP BY u.id,u.username ORDER BY assigned DESC LIMIT 30").bind(...taskBinds).all(),
        env.DB.prepare("SELECT t.id,t.title,t.status,t.updated_at,u.username AS assignee FROM staff_tasks t JOIN users u ON u.id=t.assigned_to_user_id "+tasksWhere+" ORDER BY t.updated_at DESC LIMIT 20").bind(...taskBinds).all(),
        env.DB.prepare("SELECT t.id,t.subject,t.status,t.updated_at,u.username AS customer,a.username AS handled_by FROM support_tickets t JOIN users u ON u.id=t.user_id LEFT JOIN users a ON a.id=t.assigned_to_user_id "+ticketWhere+" ORDER BY t.updated_at DESC LIMIT 20").bind(...ticketBinds).all(),
        scoped
          ? env.DB.prepare("SELECT id,action,created_at FROM team_audit_logs WHERE actor_user_id=? OR target_user_id=? ORDER BY created_at DESC LIMIT 30").bind(user.id,user.id).all()
          : env.DB.prepare("SELECT id,action,created_at FROM team_audit_logs ORDER BY created_at DESC LIMIT 30").all(),
      ]);
      return json({success:true,data:{ok:true,overview:{
        active_members:Number(memberCount?.total||0),pending_appointments:Number(pendingInvites?.total||0),
        tasks_pending:Number(taskCounts?.pending||0),tasks_overdue:Number(taskCounts?.overdue||0),
        tasks_completed_today:Number(taskCounts?.completed_today||0),tasks_completed_week:Number(taskCounts?.completed_week||0),
        tasks_completed_month:Number(taskCounts?.completed_month||0),tickets_open:Number(ticketCount?.total||0),
        member_performance:performance.results||[],recent_tasks:recentTasks.results||[],recent_tickets:recentTickets.results||[],recent_audit:audit.results||[],
      }}});
    } catch { return fail("Team overview is unavailable. Apply D1 migrations 0062, 0064, 0074 and the support ticket migrations.",503); }
  }

  if (path === "/api/team/tasks" && method === "GET") {
    if (!user) return fail("Team authentication required", 401);
    const access = await getTeamTaskContext(env, user);
    if (!access.canAssign) return fail("Task supervision permission required", 403);
    try {
      const taskQuery = access.isAdmin
        ? "SELECT t.id,t.title,t.description,t.status,t.due_at,t.created_at,t.updated_at,t.completed_at,t.assigned_to_user_id,u.username AS assignee_username FROM staff_tasks t JOIN users u ON u.id=t.assigned_to_user_id ORDER BY t.updated_at DESC LIMIT 300"
        : "SELECT t.id,t.title,t.description,t.status,t.due_at,t.created_at,t.updated_at,t.completed_at,t.assigned_to_user_id,u.username AS assignee_username FROM staff_tasks t JOIN users u ON u.id=t.assigned_to_user_id WHERE t.created_by_user_id=? OR t.assigned_to_user_id IN (SELECT user_id FROM team_workspace_members WHERE supervisor_user_id=? AND status='active' AND workspace_role='staff_member') ORDER BY t.updated_at DESC LIMIT 300";
      const tasks = access.isAdmin
        ? await env.DB.prepare(taskQuery).all()
        : await env.DB.prepare(taskQuery).bind(user.id,user.id).all();
      const members = await env.DB.prepare(
        "SELECT u.id,u.username,'staff_member' AS role,'active' AS appointment_status,tw.supervisor_user_id AS supervisor_id FROM users u JOIN team_workspace_members tw ON tw.user_id=u.id WHERE tw.workspace_role='staff_member' AND tw.status='active' AND u.banned=0 AND u.deleted_at IS NULL AND (?=1 OR tw.supervisor_user_id=?) ORDER BY u.username LIMIT 300"
      ).bind(access.isAdmin?1:0,user.id).all();
      return json({success:true,data:{ok:true,role:access.role,permissions:access.permissions,can_assign:true,tasks:tasks.results||[],members:members.results||[]}});
    } catch { return fail("Team task workspace is unavailable. Apply D1 migrations 0064 and 0074.",503); }
  }

  if (path === "/api/team/tasks" && method === "POST") {
    if (!user) return fail("Team authentication required", 401);
    const access = await getTeamTaskContext(env, user);
    if (!access.canAssign) return fail("Task assignment permission required", 403);
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return fail("JSON body required", 415);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some(key => !["title","description","assigned_to_user_id","due_at"].includes(key))) return fail("Invalid task payload");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const assignee = typeof body.assigned_to_user_id === "string" ? body.assigned_to_user_id : "";
    const dueAt = body.due_at === null || body.due_at === undefined || body.due_at === "" ? null : body.due_at;
    if (title.length < 2 || title.length > 160 || description.length > 5000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignee)) return fail("Valid title, description and active Staff Member are required");
    if (dueAt !== null && (typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)))) return fail("Invalid due date");
    try {
      const target = await env.DB.prepare(
        "SELECT u.id FROM users u JOIN team_workspace_members tw ON tw.user_id=u.id WHERE u.id=? AND u.banned=0 AND u.deleted_at IS NULL AND tw.workspace_role='staff_member' AND tw.status='active' AND (?=1 OR tw.supervisor_user_id=?)"
      ).bind(assignee,access.isAdmin?1:0,user.id).first<{id:string}>();
      if (!target) return fail("Staff Member is not active or is outside your supervision scope",403);
      const id = uuid();
      await env.DB.prepare("INSERT INTO staff_tasks(id,title,description,assigned_to_user_id,created_by_user_id,due_at) VALUES(?,?,?,?,?,?)")
        .bind(id,title,description,assignee,user.id,dueAt ? new Date(String(dueAt)).toISOString() : null).run();
      await env.DB.prepare("INSERT INTO team_audit_logs(id,actor_user_id,target_user_id,action,details_json) VALUES(?,?,?,?,?)")
        .bind(uuid(),user.id,assignee,"staff_task_assigned",JSON.stringify({task_id:id,title})).run().catch(() => {});
      return json({success:true,data:{id}},201);
    } catch { return fail("Could not assign team task. Check D1 migrations 0064 and 0074.",503); }
  }

  const teamTaskMatch = path.match(/^\/api\/team\/tasks\/([0-9a-f-]{36})$/i);
  if (teamTaskMatch && method === "PATCH") {
    if (!user) return fail("Team authentication required",401);
    const access = await getTeamTaskContext(env,user);
    if (!access.canAssign) return fail("Task review permission required",403);
    const body = await request.json().catch(() => null) as Record<string,unknown>|null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!body || Object.keys(body).some(key => key !== "status") || !["todo","in_progress","blocked","completed"].includes(status)) return fail("Invalid task status");
    const task = await env.DB.prepare("SELECT id,assigned_to_user_id,created_by_user_id FROM staff_tasks WHERE id=?").bind(teamTaskMatch[1]).first<{id:string;assigned_to_user_id:string;created_by_user_id:string}>();
    if (!task) return fail("Task not found",404);
    const supervised = access.isAdmin || task.created_by_user_id === user.id || !!(await env.DB.prepare(
      "SELECT 1 AS allowed FROM team_workspace_members WHERE user_id=? AND supervisor_user_id=? AND workspace_role='staff_member' AND status='active'"
    ).bind(task.assigned_to_user_id,user.id).first());
    if (!supervised) return fail("Task is outside your supervision scope",403);
    await env.DB.prepare("UPDATE staff_tasks SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completed_at=CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE id=?")
      .bind(status,status,task.id).run();
    await env.DB.prepare("INSERT INTO team_audit_logs(id,actor_user_id,target_user_id,action,details_json) VALUES(?,?,?,?,?)")
      .bind(uuid(),user.id,task.assigned_to_user_id,"staff_task_status_updated",JSON.stringify({task_id:task.id,status})).run().catch(() => {});
    return json({success:true});
  }

  if (path === "/api/staff/tasks" && method === "GET") {
    if (!user) return fail("Staff Member access required", 403);
    const [legacyWorkspace, teamWorkspace] = await Promise.all([
      env.DB.prepare("SELECT 1 AS active FROM staff_workspace_members WHERE user_id=? AND is_active=1 AND workspace_role='staff_member'").bind(user.id).first().catch(() => null),
      env.DB.prepare("SELECT 1 AS active FROM team_workspace_members WHERE user_id=? AND status='active' AND workspace_role='staff_member'").bind(user.id).first().catch(() => null),
    ]);
    if (!legacyWorkspace && !teamWorkspace) return fail("Staff Member access required", 403);
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
    const [legacyWorkspace, teamWorkspace] = await Promise.all([
      env.DB.prepare("SELECT 1 AS active FROM staff_workspace_members WHERE user_id=? AND is_active=1 AND workspace_role='staff_member'").bind(user.id).first().catch(() => null),
      env.DB.prepare("SELECT 1 AS active FROM team_workspace_members WHERE user_id=? AND status='active' AND workspace_role='staff_member'").bind(user.id).first().catch(() => null),
    ]);
    if (!legacyWorkspace && !teamWorkspace) return fail("Staff Member access required", 403);
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

  if (path === "/api/admin/reports" && method === "GET") {
    if (!user || !["owner","super_admin"].includes(user.role)) return fail("Admin access required",403);
    const url = new URL(request.url);
    const requested = url.searchParams.get("status") || "open";
    const status = requested === "open" ? "pending" : requested;
    if (!["all","pending","under_review","resolved","dismissed"].includes(status)) return fail("Invalid report status");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100),1),200);
    const sources = [
      { table: "post_reports", target_type: "post" },
      { table: "comment_reports", target_type: "comment" },
      { table: "marketplace_listing_reports", target_type: "listing" },
      { table: "user_reports", target_type: "user" },
      { table: "chat_message_reports", target_type: "message" },
      { table: "community_reports", target_type: "group" },
    ];
    try {
      const batches = await Promise.all(sources.map(async source => {
        const where = status === "all" ? "" : "WHERE r.status=?";
        const query = "SELECT r.id,r.reason,r.details,r.status,r.created_at,u.username AS reporter_username FROM " +
          source.table + " r LEFT JOIN users u ON u.id=r.reporter_id " + where + " ORDER BY r.created_at DESC LIMIT ?";
        const result = status === "all"
          ? await env.DB.prepare(query).bind(limit).all()
          : await env.DB.prepare(query).bind(status,limit).all();
        return (result.results || []).map((row: any) => ({
          ...row,
          target_type: source.target_type,
          reason_label: String(row.reason || "other").replace(/_/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase()),
          notes: row.details || null,
          target_preview: null,
          status: row.status === "pending" ? "open" : row.status,
          resolution_note: null,
        }));
      }));
      const data = batches.flat().sort((a:any,b:any) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit);
      return json({ success: true, data });
    } catch {
      return fail("Reports are unavailable. Check the D1 report schema and apply migrations 0055 and 0066.",503);
    }
  }

  const reportAction = path.match(/^\/api\/admin\/reports\/([0-9a-f-]{36})$/i);
  if (reportAction && method === "PATCH") {
    if (!user || !["owner","super_admin"].includes(user.role)) return fail("Admin access required",403);
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return fail("JSON body required",415);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const allowed = ["under_review","resolved","dismissed"];
    const decision = typeof body?.decision === "string" ? body.decision : "";
    const note = typeof body?.note === "string" ? body.note.trim() : null;
    if (!body || Object.keys(body).some(key => !["decision","note"].includes(key)) ||
        !allowed.includes(decision) || (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > 2000))) {
      return fail("Invalid report decision");
    }
    const targets = [
      { table: "post_reports", type: "post" },
      { table: "comment_reports", type: "comment" },
      { table: "marketplace_listing_reports", type: "listing" },
      { table: "user_reports", type: "user" },
      { table: "chat_message_reports", type: "message" },
      { table: "community_reports", type: "group" },
    ];
    try {
      let matched: { table: string; type: string } | null = null;
      for (const target of targets) {
        const found = await env.DB.prepare("SELECT id FROM " + target.table + " WHERE id=?").bind(reportAction[1]).first();
        if (found) { matched = target; break; }
      }
      if (!matched) return fail("Report not found",404);
      await env.DB.batch([
        env.DB.prepare("UPDATE " + matched.table + " SET status=? WHERE id=?").bind(decision,reportAction[1]),
        env.DB.prepare("INSERT INTO admin_report_reviews(id,report_id,target_type,reviewer_user_id,decision,note) VALUES(?,?,?,?,?,?)")
          .bind(uuid(),reportAction[1],matched.type,user.id,decision,note),
      ]);
      return json({ success: true });
    } catch {
      return fail("Could not save report decision. Apply D1 migration 0066 first.",503);
    }
  }

  if (path === "/api/admin/features" && method === "GET") {
    if (!user || !["owner", "super_admin"].includes(user.role)) return fail("Admin access required", 403);
    try {
      for (const feature of definitions(env)) {
        await env.DB.prepare("INSERT INTO feature_flags(key,enabled) VALUES(?,0) ON CONFLICT(key) DO NOTHING").bind(feature.key).run();
      }
      const rows = await env.DB.prepare("SELECT key, enabled FROM feature_flags ORDER BY key").all<{ key: string; enabled: number }>();
      const enabledByKey = new Map((rows.results || []).map(row => [row.key, Number(row.enabled) === 1]));
      const data = definitions(env).map(feature => ({
        id: feature.key,
        feature_key: feature.key,
        display_name: feature.display_name,
        description: feature.description,
        ready: feature.ready,
        blocked_reason: feature.blocked_reason,
        is_enabled_globally: enabledByKey.get(feature.key) === true,
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
      // Upsert the central flag so the setting is durable even when no admin
      // has opened the feature-control screen before. The feature_flags table
      // remains the single source of truth checked by every assistant request.
      await env.DB.prepare(
        "INSERT INTO feature_flags(key,enabled) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled"
      ).bind(key, body.is_enabled_globally ? 1 : 0).run();
      return json({ success: true, data: { feature_key: key, is_enabled_globally: body.is_enabled_globally } });
    } catch {
      return fail("Could not update feature setting", 503);
    }
  }

  return null;
}
