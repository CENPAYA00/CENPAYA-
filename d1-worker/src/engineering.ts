import type { Env, User } from "./types.js";
import { uuid } from "./security.js";

type Context={path:string;method:string;user:User|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const ok=(data:unknown,status=200)=>json({success:true,data:{ok:true,...(data as object)}},status);
const ROLES:Record<string,string>={
 supabase_engineer:"Database schema, migrations, SQL functions, RLS and database performance.",
 d1_engineer:"Cloudflare D1, Worker APIs, storage bindings, scheduled jobs and runtime reliability.",
 application_code_engineer:"Frontend/backend implementation, bugs, pull requests, type checks and tests.",
 security_engineer:"Authorized security reviews, access-control testing, vulnerability reports and fix verification.",
 ui_ux_designer:"User flows, interface design, responsive layouts, accessibility and design handoff."
};
const ACTIVE_TEAM_ROLES=["owner","super_admin","vice_admin","support_agent","staff_member"];
const isAdmin=(u:User)=>!!u&&["owner","super_admin"].includes(u.role);
async function isEngineer(db:D1Database,id:string){return !!(await db.prepare("SELECT 1 AS yes FROM engineering_appointments WHERE user_id=? AND status='active' LIMIT 1").bind(id).first());}
async function isTeam(db:D1Database,id:string){
 const row=await db.prepare("SELECT role FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL").bind(id).first<{role:string}>();
 if(row&&ACTIVE_TEAM_ROLES.includes(row.role))return true;
 const staff=await db.prepare("SELECT 1 AS yes FROM staff_workspace_members WHERE user_id=? AND is_active=1").bind(id).first().catch(()=>null);
 return !!staff;
}
async function canUseChat(db:D1Database,id:string){const row=await db.prepare("SELECT role FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL").bind(id).first<{role:string}>();return !!row&&(ACTIVE_TEAM_ROLES.includes(row.role)||await isTeam(db,id)||await isEngineer(db,id));}
async function audit(db:D1Database,actor:string,target:string|null,action:string,details:Record<string,unknown>){
 await db.prepare("INSERT INTO engineering_audit_logs(id,actor_user_id,target_user_id,action,details_json) VALUES(?,?,?,?,?)")
 .bind(uuid(),actor,target,action,JSON.stringify(details)).run();
}
async function ensureGeneralRoom(db:D1Database,actor:string){
 let room=await db.prepare("SELECT id FROM team_chat_conversations WHERE conversation_type='general' AND is_archived=0 LIMIT 1").first<{id:string}>();
 if(!room){
  const id=uuid();
  await db.prepare("INSERT OR IGNORE INTO team_chat_conversations(id,conversation_type,title,created_by_user_id) VALUES(?,'general','General Team Room',?)").bind(id,actor).run();
  room=await db.prepare("SELECT id FROM team_chat_conversations WHERE conversation_type='general' AND is_archived=0 LIMIT 1").first<{id:string}>();
 }
 if(!room)return null;
 await db.prepare(`INSERT OR IGNORE INTO team_chat_members(conversation_id,user_id,added_by_user_id)
 SELECT ?,u.id,? FROM users u
 WHERE u.banned=0 AND u.deleted_at IS NULL AND (
  u.role IN ('owner','super_admin','vice_admin','support_agent','staff_member')
  OR EXISTS(SELECT 1 FROM staff_workspace_members sw WHERE sw.user_id=u.id AND sw.is_active=1)
  OR EXISTS(SELECT 1 FROM engineering_appointments ea WHERE ea.user_id=u.id AND ea.status='active')
 )`).bind(room.id,actor).run();
 return room.id;
}
async function memberOf(db:D1Database,conversationId:string,userId:string){
 return !!(await db.prepare("SELECT 1 AS yes FROM team_chat_members WHERE conversation_id=? AND user_id=?").bind(conversationId,userId).first());
}
export async function handleEngineeringRoutes(request:Request,env:Env,{path,method,user}:Context):Promise<Response|null>{
 if(path.startsWith("/api/engineering/")||path.startsWith("/api/admin/engineering/")||path.startsWith("/api/team/chat/")){
  if(!user)return fail("Authentication required",401);
 }
 if(path==="/api/engineering/profile"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT id,engineering_role AS role,description,is_lead,status,appointed_at FROM engineering_appointments WHERE user_id=? AND status='active' ORDER BY appointed_at").bind(user!.id).all();
  if(!rows.results?.length)return fail("No active engineering appointment",403);
  return ok({user_id:user!.id,app_role:user!.role,appointments:rows.results});
 }
 if(path==="/api/admin/engineering/users"&&method==="GET"){
  if(!isAdmin(user))return fail("Owner or Super Admin authority required",403);
  const rows=await env.DB.prepare("SELECT id,username,email,role FROM users WHERE banned=0 AND deleted_at IS NULL ORDER BY username LIMIT 500").all();
  return ok({users:rows.results||[]});
 }
 if(path==="/api/admin/engineering/appointments"&&method==="GET"){
  if(!isAdmin(user))return fail("Owner or Super Admin authority required",403);
  const rows=await env.DB.prepare(`SELECT ea.id,ea.user_id,ea.engineering_role,ea.description,ea.is_lead,ea.status,ea.appointed_at,
   u.username,u.email,u.role AS app_role FROM engineering_appointments ea JOIN users u ON u.id=ea.user_id
   ORDER BY CASE ea.status WHEN 'active' THEN 0 ELSE 1 END,ea.appointed_at DESC LIMIT 500`).all();
  return ok({appointments:rows.results||[]});
 }
 if(path==="/api/admin/engineering/appointments"&&method==="POST"){
  if(!isAdmin(user))return fail("Owner or Super Admin authority required",403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const allowed=["user_id","engineering_role","is_lead"];
  if(!body||Object.keys(body).some(k=>!allowed.includes(k)))return fail("Invalid appointment payload");
  const userId=typeof body.user_id==="string"?body.user_id:"";
  const role=typeof body.engineering_role==="string"?body.engineering_role:"";
  const lead=body.is_lead===true;
  if(!userId||!ROLES[role])return fail("Choose a valid user and engineering function");
  if(lead&&user!.role!=="owner")return fail("Only the Owner can appoint the Lead Engineer",403);
  const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL").bind(userId).first();
  if(!target)return fail("Selected account is unavailable",404);
  const id=uuid();
  try{
   if(lead)await env.DB.prepare("UPDATE engineering_appointments SET is_lead=0 WHERE is_lead=1 AND status='active'").run();
   await env.DB.prepare(`INSERT INTO engineering_appointments(id,user_id,engineering_role,description,is_lead,status,appointed_by_user_id)
    VALUES(?,?,?,?,?,'active',?) ON CONFLICT(user_id,engineering_role) DO UPDATE SET description=excluded.description,is_lead=excluded.is_lead,status='active',appointed_by_user_id=excluded.appointed_by_user_id,appointed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),removed_by_user_id=NULL,removed_at=NULL`)
    .bind(id,userId,role,ROLES[role],lead?1:0,user!.id).run();
   const appointment=await env.DB.prepare("SELECT id FROM engineering_appointments WHERE user_id=? AND engineering_role=?").bind(userId,role).first<{id:string}>();
   await audit(env.DB,user!.id,userId,"engineering_appointed",{engineering_role:role,is_lead:lead});
   await ensureGeneralRoom(env.DB,user!.id);
   return ok({appointment_id:appointment?.id},201);
  }catch{return fail("Could not activate appointment. Check D1 migration 0075.",503);}
 }
 const removeMatch=path.match(/^\/api\/admin\/engineering\/appointments\/([0-9a-f-]{36})$/i);
 if(removeMatch&&method==="DELETE"){
  if(!isAdmin(user))return fail("Owner or Super Admin authority required",403);
  const row=await env.DB.prepare("SELECT id,user_id,engineering_role,is_lead,status FROM engineering_appointments WHERE id=? AND status='active'").bind(removeMatch[1]).first<any>();
  if(!row)return fail("Active appointment not found",404);
  await env.DB.prepare("UPDATE engineering_appointments SET status='removed',is_lead=0,removed_by_user_id=?,removed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(user!.id,row.id).run();
  await audit(env.DB,user!.id,row.user_id,"engineering_removed",{engineering_role:row.engineering_role});
  return ok({removed:true});
 }
 if(path==="/api/engineering/tasks"&&method==="GET"){
  if(!(await isEngineer(env.DB,user!.id)))return fail("Active engineering appointment required",403);
  const lead=!!(await env.DB.prepare("SELECT 1 AS yes FROM engineering_appointments WHERE user_id=? AND is_lead=1 AND status='active'").bind(user!.id).first());
  const rows=await env.DB.prepare(`SELECT t.*,u.username AS assignee_username,
   (SELECT json_group_array(json_object('id',x.id,'author_id',x.author_user_id,'update_type',x.update_type,'body',x.body,'attachment_url',x.attachment_url,'created_at',x.created_at))
    FROM engineering_task_updates x WHERE x.task_id=t.id) AS updates_json
   FROM engineering_tasks t LEFT JOIN users u ON u.id=t.assigned_to_user_id
   WHERE t.assigned_to_user_id=? OR (?=1 AND t.supervisor_user_id=?) OR ?=2
   ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'submitted' THEN 3 ELSE 4 END,COALESCE(t.due_at,'9999-12-31'),t.created_at DESC LIMIT 200`)
   .bind(user!.id,lead?1:0,user!.id,isAdmin(user)?2:0).all<any>();
  const tasks=(rows.results||[]).map(t=>({...t,updates:(()=>{try{return JSON.parse(t.updates_json||"[]")}catch{return[]}})()}));
  return ok({tasks});
 }
 if(path==="/api/engineering/tasks"&&method==="POST"){
  if(!isAdmin(user)&&!(await env.DB.prepare("SELECT 1 AS yes FROM engineering_appointments WHERE user_id=? AND is_lead=1 AND status='active'").bind(user!.id).first()))return fail("Owner, Super Admin or Lead Engineer required",403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const title=typeof body?.title==="string"?body.title.trim():"";
  const description=typeof body?.description==="string"?body.description.trim():"";
  const assignee=typeof body?.assigned_to_user_id==="string"?body.assigned_to_user_id:"";
  const due=body?.due_at==null||body.due_at===""?null:body.due_at;
  if(!body||Object.keys(body).some(k=>!["title","description","assigned_to_user_id","due_at"].includes(k))||title.length<3||title.length>160||description.length>5000||!assignee)return fail("Valid title, description and engineering assignee are required");
  if(due!==null&&(typeof due!=="string"||!Number.isFinite(Date.parse(due))))return fail("Invalid due date");
  if(!(await isEngineer(env.DB,assignee)))return fail("Assignee must have an active engineering appointment",403);
  if(!isAdmin(user)&&assignee===user!.id)return fail("Lead Engineer cannot assign a task to themselves",403);
  const id=uuid();
  await env.DB.prepare("INSERT INTO engineering_tasks(id,title,description,assigned_to_user_id,assigned_by_user_id,supervisor_user_id,due_at) VALUES(?,?,?,?,?,?,?)")
   .bind(id,title,description,assignee,user!.id,user!.id,due?new Date(due).toISOString():null).run();
  await env.DB.prepare("INSERT INTO engineering_task_updates(id,task_id,author_user_id,update_type,body) VALUES(?,?,?,'status_change','Engineering task assigned')").bind(uuid(),id,user!.id).run();
  await audit(env.DB,user!.id,assignee,"engineering_task_assigned",{task_id:id,title});
  return ok({task_id:id},201);
 }
 const taskMatch=path.match(/^\/api\/engineering\/tasks\/([0-9a-f-]{36})$/i);
 if(taskMatch&&method==="PATCH"){
  if(!(await isEngineer(env.DB,user!.id)))return fail("Active engineering appointment required",403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const status=typeof body?.status==="string"?body.status:"";
  const note=typeof body?.body==="string"?body.body.trim():"";
  const evidence=typeof body?.attachment_url==="string"?body.attachment_url.trim():"";
  if(!body||Object.keys(body).some(k=>!["status","body","attachment_url"].includes(k))||!["todo","in_progress","blocked","submitted","completed","cancelled"].includes(status)||note.length>5000||evidence.length>2048||(evidence&&!/^https:\/\//i.test(evidence)))return fail("Invalid task update");
  const task=await env.DB.prepare("SELECT * FROM engineering_tasks WHERE id=?").bind(taskMatch[1]).first<any>();
  if(!task)return fail("Task not found",404);
  const lead=!!(await env.DB.prepare("SELECT 1 AS yes FROM engineering_appointments WHERE user_id=? AND is_lead=1 AND status='active'").bind(user!.id).first());
  const reviewer=isAdmin(user)|| (lead&&task.supervisor_user_id===user!.id);
  if(task.assigned_to_user_id!==user!.id&&!reviewer)return fail("Not authorized for this engineering task",403);
  if(task.assigned_to_user_id===user!.id&&!reviewer&&!["todo","in_progress","blocked","submitted"].includes(status))return fail("Only a reviewer can approve or cancel work",403);
  await env.DB.prepare("UPDATE engineering_tasks SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completed_at=CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE id=?").bind(status,status,task.id).run();
  if(note||evidence||status!==task.status)await env.DB.prepare("INSERT INTO engineering_task_updates(id,task_id,author_user_id,update_type,body,attachment_url) VALUES(?,?,?,?,?,?)")
   .bind(uuid(),task.id,user!.id,status==="submitted"?"submission":evidence?"evidence":status!==task.status?"status_change":"comment",note||null,evidence||null).run();
  await audit(env.DB,user!.id,task.assigned_to_user_id,"engineering_task_updated",{task_id:task.id,status});
  return ok({updated:true});
 }
 if(path==="/api/team/chat/conversations"&&method==="GET"){
  if(!(await canUseChat(env.DB,user!.id)))return fail("Team membership required",403);
  const generalId=await ensureGeneralRoom(env.DB,user!.id);
  const rows=await env.DB.prepare(`SELECT c.id,c.conversation_type AS type,c.title,
   (SELECT body FROM team_chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message
   FROM team_chat_conversations c JOIN team_chat_members cm ON cm.conversation_id=c.id
   WHERE cm.user_id=? AND c.is_archived=0 ORDER BY c.created_at DESC`).bind(user!.id).all();
  return ok({conversations:rows.results||[],general_conversation_id:generalId});
 }
 if(path==="/api/team/chat/members"&&method==="GET"){
  if(!(await canUseChat(env.DB,user!.id)))return fail("Team membership required",403);
  await ensureGeneralRoom(env.DB,user!.id);
  const rows=await env.DB.prepare(`SELECT u.id,u.username,u.role,
   (SELECT json_group_array(ea.engineering_role) FROM engineering_appointments ea WHERE ea.user_id=u.id AND ea.status='active') AS engineering_roles
   FROM users u WHERE u.banned=0 AND u.deleted_at IS NULL AND (
    u.role IN ('owner','super_admin','vice_admin','support_agent','staff_member')
    OR EXISTS(SELECT 1 FROM staff_workspace_members sw WHERE sw.user_id=u.id AND sw.is_active=1)
    OR EXISTS(SELECT 1 FROM engineering_appointments ea WHERE ea.user_id=u.id AND ea.status='active')
   ) ORDER BY u.username LIMIT 300`).all();
  const members=(rows.results||[]).map((m:any)=>({...m,engineering_roles:(()=>{try{return JSON.parse(m.engineering_roles||"[]")}catch{return[]}})()} )}));
  return ok({members});
 }
 if(path==="/api/team/chat/conversations"&&method==="POST"){
  if(!(await canUseChat(env.DB,user!.id)))return fail("Team membership required",403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const type=body?.type;
  const title=typeof body?.title==="string"?body.title.trim():"";
  const recipients=Array.isArray(body?.member_ids)?body.member_ids.filter((x):x is string=>typeof x==="string"):[];
  if(!body||Object.keys(body).some(k=>!["type","title","member_ids"].includes(k))||!["direct","group","announcement"].includes(String(type))||recipients.length>30||new Set(recipients).size!==recipients.length)return fail("Invalid conversation details");
  if(type==="direct"&&recipients.length!==1)return fail("A direct message requires one recipient");
  if(type==="announcement"&&!isAdmin(user))return fail("Only Owner or Super Admin can create announcements",403);
  const id=uuid(),all=[...new Set([user!.id,...recipients])];
  for(const recipient of all)if(!(await canUseChat(env.DB,recipient)))return fail("Every participant must be an active team member",403);
  await env.DB.prepare("INSERT INTO team_chat_conversations(id,conversation_type,title,created_by_user_id) VALUES(?,?,?,?)")
   .bind(id,type,type==="direct"?"Direct message":title.slice(0,120)||"Team discussion",user!.id).run();
  for(const member of all)await env.DB.prepare("INSERT INTO team_chat_members(conversation_id,user_id,added_by_user_id) VALUES(?,?,?)").bind(id,member,user!.id).run();
  return ok({conversation_id:id},201);
 }
 const messagesMatch=path.match(/^\/api\/team\/chat\/conversations\/([0-9a-f-]{36})\/messages$/i);
 if(messagesMatch&&method==="GET"){
  if(!(await canUseChat(env.DB,user!.id))||!(await memberOf(env.DB,messagesMatch[1],user!.id)))return fail("Active team membership and conversation membership required",403);
  const rows=await env.DB.prepare(`SELECT m.id,m.body,m.attachment_url,m.created_at,u.username AS sender_name
   FROM team_chat_messages m JOIN users u ON u.id=m.sender_user_id
   WHERE m.conversation_id=? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`).bind(messagesMatch[1]).all();
  await env.DB.prepare("UPDATE team_chat_members SET last_read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE conversation_id=? AND user_id=?").bind(messagesMatch[1],user!.id).run();
  return ok({messages:(rows.results||[]).reverse()});
 }
 if(messagesMatch&&method==="POST"){
  if(!(await canUseChat(env.DB,user!.id))||!(await memberOf(env.DB,messagesMatch[1],user!.id)))return fail("Active team membership and conversation membership required",403);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const message=typeof body?.body==="string"?body.body.trim():"";
  const attachment=typeof body?.attachment_url==="string"?body.attachment_url.trim():"";
  if(!body||Object.keys(body).some(k=>!["body","attachment_url"].includes(k))||message.length<1||message.length>10000||attachment.length>2048||(attachment&&!/^https:\/\//i.test(attachment)))return fail("Invalid message");
  const id=uuid();
  await env.DB.prepare("INSERT INTO team_chat_messages(id,conversation_id,sender_user_id,body,attachment_url) VALUES(?,?,?,?,?)").bind(id,messagesMatch[1],user!.id,message,attachment||null).run();
  return ok({message_id:id},201);
 }
 return null;
}
