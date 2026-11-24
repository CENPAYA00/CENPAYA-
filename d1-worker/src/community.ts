import type { Env, User } from "./types.js";
import { extractMediaKey, signMediaUrl } from "./media.js";
import { uuid } from "./security.js";
type RouteContext = { url: URL; path: string; method: string; user: User | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
async function body(request:Request):Promise<Record<string,unknown>|null>{
  const type=request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if(type!=="application/json")return null;
  const length=Number(request.headers.get("Content-Length")||0);if(length>64_000)return null;
  try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>64_000)return null;const value:unknown=JSON.parse(raw);return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}

export async function handleCommunityRoutes(request:Request,env:Env,context:RouteContext):Promise<Response|null>{
  const {url,path,method,user}=context;
  const featureLabels: Record<string, { display_name: string; description: string }> = {
    voice_calls: { display_name: "Voice calls", description: "Enable or disable voice calling in chat." },
    video_posts: { display_name: "Short videos", description: "Allow users to publish and view video posts." },
    ai_assistant: { display_name: "AI shopping assistant", description: "Enable the Cenpaya AI shopping assistant when it is ready." },
  };
  if (path === "/api/admin/features" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    if (!["owner", "super_admin"].includes(user.role)) return fail("Forbidden", 403);
    const rows = await env.DB.prepare("SELECT key,enabled FROM feature_flags WHERE key IN ('voice_calls','video_posts','ai_assistant') ORDER BY key").all<{ key: string; enabled: number }>();
    return json({ success: true, data: rows.results.map(row => ({
      id: row.key, feature_key: row.key,
      display_name: featureLabels[row.key]?.display_name || row.key,
      description: featureLabels[row.key]?.description || "",
      is_enabled_globally: !!row.enabled,
    })) });
  }
  const featureToggle = path.match(/^\\/api\\/admin\\/features\\/([a-z_]+)$/);
  if (featureToggle && method === "PATCH") {
    if (!user) return fail("Unauthorized", 401);
    if (!["owner", "super_admin"].includes(user.role)) return fail("Forbidden", 403);
    const key = featureToggle[1];
    if (!Object.prototype.hasOwnProperty.call(featureLabels, key)) return fail("Unknown feature flag", 404);
    const b = await body(request);
    if (!b || Object.keys(b).length !== 1 || typeof b.is_enabled_globally !== "boolean") return fail("Invalid feature flag value");
    const result = await env.DB.prepare("UPDATE feature_flags SET enabled=? WHERE key=?").bind(b.is_enabled_globally ? 1 : 0, key).run();
    if (!result.meta.changes) return fail("Feature flag is not configured", 404);
    return json({ success: true, data: { id: key, is_enabled_globally: b.is_enabled_globally } });
  }
  if(path==="/api/chat/threads"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const rows=await env.DB.prepare(`SELECT t.id,t.thread_type,t.title,t.created_by,t.last_message_at,t.created_at,
      otherUser.username AS other_username,otherUser.avatar_url AS other_avatar,
      (SELECT m.message_text FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.sender_id<>? AND m.created_at>COALESCE(tm.last_read_at,'1970-01-01T00:00:00.000Z')) AS unread_count
      FROM chat_thread_members tm JOIN chat_threads t ON t.id=tm.thread_id
      LEFT JOIN chat_thread_members other ON other.thread_id=t.id AND other.user_id<>tm.user_id
      LEFT JOIN users otherUser ON otherUser.id=other.user_id
      WHERE tm.user_id=? AND tm.left_at IS NULL AND t.thread_type='direct'
      AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=tm.user_id AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=tm.user_id))
      ORDER BY COALESCE(t.last_message_at,t.created_at) DESC LIMIT 100`).bind(user.id,user.id).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/chat/direct"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const other=str(b.user_id,64);
    if(!UUID.test(other)||other===user.id)return fail("A valid other user is required");
    const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(other).first();
    if(!target)return fail("User not found",404);
    const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id,other,other,user.id).first();
    if(blocked)return fail("Messaging is unavailable for this user",403);
    const directKey=[user.id,other].sort().join(":");
    const existing=await env.DB.prepare("SELECT id FROM chat_threads WHERE direct_key=?").bind(directKey).first<{id:string}>();
    if(existing){await env.DB.prepare("UPDATE chat_thread_members SET left_at=NULL WHERE thread_id=? AND user_id IN (?,?)").bind(existing.id,user.id,other).run();return json({success:true,id:existing.id,existing:true});}
    const id=uuid();
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO chat_threads(id,thread_type,direct_key,created_by) VALUES(?,'direct',?,?)").bind(id,directKey,user.id),
        env.DB.prepare("INSERT INTO chat_thread_members(thread_id,user_id,role) VALUES(?,?, 'member'),(?,?, 'member')").bind(id,user.id,id,other)
      ]);
      return json({success:true,id},201);
    }catch{
      const raced=await env.DB.prepare("SELECT id FROM chat_threads WHERE direct_key=?").bind(directKey).first<{id:string}>();
      return raced?json({success:true,id:raced.id,existing:true}):fail("Unable to create conversation",409);
    }
  }
  const chatMessages=path.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
  if(chatMessages&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const threadId=chatMessages[1];
    const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members m JOIN chat_threads t ON t.id=m.thread_id WHERE m.thread_id=? AND m.user_id=? AND m.left_at IS NULL AND t.thread_type='direct'").bind(threadId,user.id).first();
    if(!member)return fail("Conversation not found",404);
    const blocked=await env.DB.prepare("SELECT 1 FROM chat_thread_members other JOIN user_blocks b ON (b.blocker_id=? AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=?) WHERE other.thread_id=? AND other.user_id<>?").bind(user.id,user.id,threadId,user.id).first();
    if(blocked)return fail("Messaging is unavailable for this user",403);
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||50),1),100),before=url.searchParams.get("before");
    const rows=await env.DB.prepare(`SELECT m.id,m.thread_id,m.sender_id,CASE WHEN m.status='deleted' THEN 'Message deleted' ELSE m.message_text END AS message_text,CASE WHEN m.status='deleted' THEN 'text' ELSE m.message_type END AS message_type,CASE WHEN m.status='deleted' THEN NULL ELSE m.media_url END AS media_url,CASE WHEN m.status='deleted' THEN NULL ELSE m.media_key END AS media_key,m.media_duration_seconds,m.shared_post_id,m.delivered_at,m.read_at,m.status,m.created_at,
      u.username,u.display_name,u.avatar_url FROM chat_messages m JOIN users u ON u.id=m.sender_id
      WHERE m.thread_id=? ${before?"AND m.created_at < ?":""}
      ORDER BY m.created_at DESC LIMIT ?`).bind(threadId,...(before?[before]:[]),limit).all();
    const ordered=rows.results.reverse();
    const data=await Promise.all(ordered.map(async(row:any)=>{
      const {media_key,...message}=row;
      return {...message,media_url:media_key?await signMediaUrl(env,url.origin,String(media_key)):message.media_url};
    }));
    return json({success:true,data});
  }
  if(chatMessages&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const message=str(b.message_text,4000),threadId=chatMessages[1];
    const messageType=str(b.message_type,20)||"text";
    const mediaUrl=str(b.media_url,2048);
    const sharedPostId=str(b.shared_post_id,64);
    const duration=b.media_duration_seconds;
    if(!["text","image","voice_note","shared_post"].includes(messageType))return fail("Invalid message type");
    if(messageType==="text"&&!message)return fail("Message text is required");
    let mediaKey: string | null = null;
    if(messageType==="image"||messageType==="voice_note"){
      mediaKey = await extractMediaKey(mediaUrl,env,url);
      if(!mediaKey||!mediaKey.startsWith(["chat",threadId,user.id].join("/")+"/"))return fail("A valid, unexpired chat media URL is required");
    }
    if(messageType==="voice_note"&&(typeof duration!=="number"||!Number.isFinite(duration)||duration<=0||duration>3600))return fail("Invalid voice message duration");
    if(messageType==="shared_post"&&!UUID.test(sharedPostId))return fail("A valid shared post is required");
    const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(threadId,user.id).first();
    if(!member)return fail("Conversation not found",404);
    const blocked=await env.DB.prepare("SELECT 1 FROM chat_thread_members other JOIN user_blocks b ON (b.blocker_id=? AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=?) WHERE other.thread_id=? AND other.user_id<>?").bind(user.id,user.id,threadId,user.id).first();
    if(blocked)return fail("Messaging is unavailable for this user",403);
    if(messageType==="shared_post"){
      const post=await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL AND (visibility='public' OR author_id=?)").bind(sharedPostId,user.id).first();
      if(!post)return fail("Shared post not found",404);
    }
    const id=uuid();
    await env.DB.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,message_text,media_key,message_type,media_duration_seconds,shared_post_id) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id,threadId,user.id,message || (messageType==="image" ? "Photo" : messageType==="voice_note" ? "Voice message" : "Shared a post"),mediaKey,messageType,typeof duration==="number"?duration:null,messageType==="shared_post"?sharedPostId:null).run();
    await env.DB.prepare("UPDATE chat_thread_members SET last_read_at="+NOW+" WHERE thread_id=? AND user_id=?").bind(threadId,user.id).run();
    return json({success:true,id},201);
  }
  const chatRead=path.match(/^\/api\/chat\/threads\/([^/]+)\/read$/);
  if(chatRead&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const r=await env.DB.prepare("UPDATE chat_thread_members SET last_read_at="+NOW+" WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatRead[1],user.id).run();
    if(!r.meta.changes)return fail("Conversation not found",404);
    await env.DB.prepare("UPDATE chat_messages SET read_at="+NOW+" WHERE thread_id=? AND sender_id<>? AND read_at IS NULL").bind(chatRead[1],user.id).run();
    return json({success:true});
  }
  if (path === "/api/push/subscriptions" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const requestedUser = str(b.user_id, 64);
    const endpoint = str(b.endpoint, 2048);
    const p256dh = str(b.p256dh, 256);
    const authKey = str(b.auth, 256);
    if (requestedUser !== user.id) return fail("Subscription user does not match the authenticated account", 403);
    let endpointUrl: URL;
    try { endpointUrl = new URL(endpoint); } catch { return fail("Invalid push endpoint"); }
    if (endpointUrl.protocol !== "https:" || !p256dh || !authKey || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(authKey)) return fail("Invalid web-push subscription");
    await env.DB.prepare("INSERT INTO notification_devices(id,user_id,platform,provider,push_endpoint,p256dh_key,auth_key) VALUES(?,?,'web','web_push',?,?,?) ON CONFLICT(push_endpoint) WHERE push_endpoint IS NOT NULL DO UPDATE SET user_id=excluded.user_id,p256dh_key=excluded.p256dh_key,auth_key=excluded.auth_key,is_active=1,revoked_at=NULL,updated_at=" + NOW)
      .bind(uuid(), user.id, endpoint, p256dh, authKey).run();
    return json({ success: true });
  }
  if(path==="/api/notifications"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||30),1),100);
    const rows=await env.DB.prepare("SELECT id,actor_id,notification_type,entity_type,entity_id,title,body,link_url,is_read,read_at,created_at FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT ?").bind(user.id,limit).all();
    return json({success:true,data:rows.results});
  }
  const mark=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(mark&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    await env.DB.prepare("UPDATE notifications SET is_read=1,read_at="+NOW+" WHERE id=? AND recipient_id=?").bind(mark[1],user.id).run();
    return json({success:true});
  }
  if(path==="/api/support/tickets"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const subject=str(b.subject,160),description=str(b.description,5000),category=str(b.category,40)||"general";
    if(!subject||!description||!["general","account","technical","marketplace","payments","security","privacy","other"].includes(category))return fail("Valid subject, description and category required");
    const id=uuid(),number="CP-"+Date.now().toString(36).toUpperCase()+"-"+uuid().slice(0,8).toUpperCase();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_tickets(id,user_id,ticket_number,subject,description,category) VALUES(?,?,?,?,?,?)").bind(id,user.id,number,subject,description,category),
      env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_type,sender_user_id,message_text) VALUES(?,?,'user',?,?)").bind(uuid(),id,user.id,description)
    ]);
    return json({success:true,id,ticket_number:number},201);
  }
  if(path==="/api/support/tickets"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const rows=await env.DB.prepare("SELECT id,ticket_number,subject,category,priority,status,last_message_at,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
    return json({success:true,data:rows.results});
  }

  const chatLeave = path.match(/^\/api\/chat\/threads\/([^/]+)\/leave$/);
  if (chatLeave && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const result = await env.DB.prepare("UPDATE chat_thread_members SET left_at=" + NOW + " WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatLeave[1], user.id).run();
    return result.meta.changes ? json({ success: true }) : fail("Conversation not found", 404);
  }
  const chatDeleteMessage = path.match(/^\/api\/chat\/threads\/([^/]+)\/messages\/([^/]+)$/);
  if (chatDeleteMessage && method === "DELETE") {
    if (!user) return fail("Unauthorized", 401);
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatDeleteMessage[1], user.id).first();
    if (!member) return fail("Conversation not found", 404);
    const result = await env.DB.prepare("UPDATE chat_messages SET status='deleted' WHERE id=? AND thread_id=? AND sender_id=? AND status<>'deleted'").bind(chatDeleteMessage[2], chatDeleteMessage[1], user.id).run();
    return result.meta.changes ? json({ success: true }) : fail("Message not found", 404);
  }
  const forwardTargets = path.match(/^\/api\/chat\/threads\/([^/]+)\/forward-targets$/);
  if (forwardTargets && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(forwardTargets[1], user.id).first();
    if (!member) return fail("Conversation not found", 404);
    const rows = await env.DB.prepare(`SELECT t.id,u.id AS user_id,u.username,u.avatar_url,t.last_message_at
      FROM chat_thread_members mine JOIN chat_threads t ON t.id=mine.thread_id
      JOIN chat_thread_members other ON other.thread_id=t.id AND other.user_id<>mine.user_id AND other.left_at IS NULL
      JOIN users u ON u.id=other.user_id
      WHERE mine.user_id=? AND mine.left_at IS NULL AND t.thread_type='direct' AND t.id<>?
      AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=mine.user_id AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=mine.user_id))
      ORDER BY COALESCE(t.last_message_at,t.created_at) DESC LIMIT 50`).bind(user.id, forwardTargets[1]).all();
    return json({ success: true, data: rows.results });
  }
  const forwardMessage = path.match(/^\/api\/chat\/messages\/([^/]+)\/forward$/);
  if (forwardMessage && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const targetThread = str(b.thread_id, 64);
    const [source, target] = await Promise.all([
      env.DB.prepare("SELECT m.thread_id,m.message_text,m.message_type,m.media_key,m.media_url,m.media_duration_seconds,m.shared_post_id,m.status FROM chat_messages m JOIN chat_thread_members tm ON tm.thread_id=m.thread_id WHERE m.id=? AND tm.user_id=? AND tm.left_at IS NULL AND NOT EXISTS(SELECT 1 FROM chat_thread_members other JOIN user_blocks b ON (b.blocker_id=tm.user_id AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=tm.user_id) WHERE other.thread_id=m.thread_id AND other.user_id<>tm.user_id)").bind(forwardMessage[1], user.id).first<Record<string, unknown>>(),
      env.DB.prepare("SELECT 1 FROM chat_thread_members mine JOIN chat_threads t ON t.id=mine.thread_id WHERE mine.thread_id=? AND mine.user_id=? AND mine.left_at IS NULL AND (t.thread_type='group' OR NOT EXISTS(SELECT 1 FROM chat_thread_members other JOIN user_blocks b ON (b.blocker_id=mine.user_id AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=mine.user_id) WHERE other.thread_id=t.id AND other.user_id<>mine.user_id))").bind(targetThread, user.id).first()
    ]);
    if (!source || source.status === "deleted" || !target) return fail("Message or destination not found", 404);
    if (source.shared_post_id) {
      const post = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL AND visibility='public'").bind(source.shared_post_id).first();
      if (!post) return fail("Only public shared posts can be forwarded", 403);
    }
    const id = uuid();
    await env.DB.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,message_text,media_key,media_url,message_type,media_duration_seconds,shared_post_id) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id,targetThread,user.id,source.message_text,source.media_key,source.media_url,source.message_type,source.media_duration_seconds,source.shared_post_id).run();
    return json({ success: true, id }, 201);
  }

  const chatPeer = path.match(/^\/api\/chat\/threads\/([^/]+)\/peer$/);
  if (chatPeer && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatPeer[1], user.id).first();
    if (!member) return fail("Conversation not found", 404);
    const blocked = await env.DB.prepare("SELECT 1 FROM chat_thread_members other JOIN user_blocks b ON (b.blocker_id=? AND b.blocked_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_id=?) WHERE other.thread_id=? AND other.user_id<>?").bind(user.id,user.id,chatPeer[1],user.id).first();
    if (blocked) return fail("Conversation not found", 404);
    const peer = await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.bio,u.last_active_at FROM chat_thread_members m JOIN users u ON u.id=m.user_id WHERE m.thread_id=? AND m.user_id<>? AND m.left_at IS NULL AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL LIMIT 1`).bind(chatPeer[1], user.id).first();
    return peer ? json({ success: true, data: peer }) : fail("Conversation partner not found", 404);
  }
  const chatSettings = path.match(/^\/api\/chat\/threads\/([^/]+)\/settings$/);
  if (chatSettings && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatSettings[1], user.id).first();
    if (!member) return fail("Conversation not found", 404);
    if (method === "GET") {
      const settings = await env.DB.prepare("SELECT chat_theme,disappearing_seconds FROM chat_thread_members WHERE thread_id=? AND user_id=?").bind(chatSettings[1], user.id).first();
      return json({ success: true, data: settings || { chat_theme: "emerald", disappearing_seconds: null } });
    }
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const sets: string[] = [], values: unknown[] = [];
    if (b.chat_theme !== undefined) {
      const theme = str(b.chat_theme, 20);
      if (!["emerald", "ocean", "sunset", "midnight"].includes(theme)) return fail("Invalid chat theme");
      sets.push("chat_theme=?"); values.push(theme);
    }
    if (b.disappearing_seconds !== undefined) {
      const seconds = b.disappearing_seconds;
      if (seconds !== null && (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < 60 || seconds > 2592000)) return fail("Invalid disappearing-message duration");
      sets.push("disappearing_seconds=?"); values.push(seconds);
    }
    if (!sets.length) return fail("No supported chat settings supplied");
    values.push(chatSettings[1], user.id);
    await env.DB.prepare("UPDATE chat_thread_members SET " + sets.join(",") + " WHERE thread_id=? AND user_id=?").bind(...values).run();
    return json({ success: true });
  }
  if (path === "/api/chat/alerts" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const after = url.searchParams.get("after");
    const unread = await env.DB.prepare(`SELECT COUNT(*) AS count FROM chat_messages m JOIN chat_thread_members mine ON mine.thread_id=m.thread_id
      WHERE mine.user_id=? AND mine.left_at IS NULL AND m.sender_id<>? AND m.created_at>COALESCE(mine.last_read_at,'1970-01-01T00:00:00.000Z')`).bind(user.id, user.id).first<{ count: number }>();
    const messages = await env.DB.prepare(`SELECT m.id,m.thread_id,m.sender_id,m.message_text,m.created_at,u.username AS sender_username
      FROM chat_messages m JOIN chat_thread_members mine ON mine.thread_id=m.thread_id
      JOIN users u ON u.id=m.sender_id
      WHERE mine.user_id=? AND mine.left_at IS NULL AND m.sender_id<>?
      AND m.created_at>COALESCE(mine.last_read_at,'1970-01-01T00:00:00.000Z')
      ${after ? "AND m.created_at>?" : ""}
      ORDER BY m.created_at ASC LIMIT 50`).bind(user.id, user.id, ...(after ? [after] : [])).all();
    return json({ success: true, data: { unread_count: Number(unread?.count || 0), messages: messages.results } });
  }

  const supportTicket = path.match(/^\/api\/support\/tickets\/([^/]+)$/);
  if (supportTicket && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const ticket = await env.DB.prepare("SELECT id,ticket_number,subject,description,category,priority,status,assigned_agent_ref,last_message_at,created_at,updated_at FROM support_tickets WHERE id=? AND user_id=?").bind(supportTicket[1], user.id).first<Record<string, unknown>>();
    if (!ticket) return fail("Support ticket not found", 404);
    const messages = await env.DB.prepare(`SELECT m.id,COALESCE(m.sender_user_id,m.support_agent_ref) AS sender_id,
      CASE WHEN m.sender_type='support' THEN 'staff' ELSE 'user' END AS sender_role,
      COALESCE(u.username,'Support') AS sender_username,m.message_text AS body,m.created_at
      FROM support_ticket_messages m LEFT JOIN users u ON u.id=m.sender_user_id
      WHERE m.ticket_id=? AND m.is_internal_note=0 AND m.status<>'deleted' ORDER BY m.created_at ASC LIMIT 300`).bind(supportTicket[1]).all();
    return json({ success: true, data: { ticket, messages: messages.results } });
  }
  const supportRead = path.match(/^\/api\/support\/tickets\/([^/]+)\/read$/);
  if (supportRead && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const result = await env.DB.prepare("UPDATE support_tickets SET user_last_read_at=" + NOW + " WHERE id=? AND user_id=?").bind(supportRead[1], user.id).run();
    return result.meta.changes ? json({ success: true }) : fail("Support ticket not found", 404);
  }
  const supportMessages = path.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  if (supportMessages && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const message = str(b.body, 4000);
    if (!message) return fail("Message cannot be empty");
    const ticket = await env.DB.prepare("SELECT id,status FROM support_tickets WHERE id=? AND user_id=?").bind(supportMessages[1], user.id).first<{ id: string; status: string }>();
    if (!ticket) return fail("Support ticket not found", 404);
    if (ticket.status === "closed" || ticket.status === "resolved") return fail("This support ticket is closed", 409);
    const id = uuid();
    await env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_type,sender_user_id,message_text) VALUES(?,?,'user',?,?)").bind(id, ticket.id, user.id, message).run();
    await env.DB.prepare("UPDATE support_tickets SET status=CASE WHEN status='waiting_for_user' THEN 'in_progress' ELSE status END WHERE id=?").bind(ticket.id).run();
    return json({ success: true, id }, 201);
  }

  if (path === "/api/config/features" && method === "GET") {
    const flags = await env.DB.prepare("SELECT key,enabled FROM feature_flags WHERE key IN ('voice_calls','video_posts','ai_assistant')").all<{ key: string; enabled: number }>();
    const enabled = new Map<string, boolean>(flags.results.map(flag => [flag.key, !!flag.enabled] as [string, boolean]));
    return json({ success: true, data: {
      voice_calls_enabled: enabled.get("voice_calls") || false,
      video_posts_enabled: enabled.get("video_posts") || false,
      ai_assistant_enabled: enabled.get("ai_assistant") || false,
    } });
  }

  if (path === "/api/groups" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT t.id,COALESCE(t.title,'Group chat') AS name,u.avatar_url,t.last_message_at,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.sender_id<>? AND m.created_at>COALESCE(mine.last_read_at,'1970-01-01T00:00:00.000Z')) AS unread_count
      FROM chat_thread_members mine JOIN chat_threads t ON t.id=mine.thread_id
      LEFT JOIN users u ON u.id=t.created_by
      WHERE mine.user_id=? AND mine.left_at IS NULL AND t.thread_type='group'
      ORDER BY COALESCE(t.last_message_at,t.created_at) DESC LIMIT 100`).bind(user.id,user.id).all();
    return json({ success: true, data: rows.results });
  }
  const groupMessages = path.match(/^\/api\/groups\/([^/]+)\/messages$/);
  if (groupMessages && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const threadId = groupMessages[1];
    const message = str(b.message_text, 4000);
    const messageType = str(b.message_type, 20) || "text";
    const sharedPostId = str(b.shared_post_id, 64);
    if (!["text", "shared_post"].includes(messageType)) return fail("Unsupported group message type");
    if (messageType === "text" && !message) return fail("Message text is required");
    if (messageType === "shared_post" && !UUID.test(sharedPostId)) return fail("A valid shared post is required");
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members m JOIN chat_threads t ON t.id=m.thread_id WHERE m.thread_id=? AND m.user_id=? AND m.left_at IS NULL AND t.thread_type='group'").bind(threadId,user.id).first();
    if (!member) return fail("Group conversation not found", 404);
    if (messageType === "shared_post") {
      const post = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL AND (visibility='public' OR author_id=?)").bind(sharedPostId,user.id).first();
      if (!post) return fail("Shared post not found", 404);
    }
    const id = uuid();
    await env.DB.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,message_text,message_type,shared_post_id) VALUES(?,?,?,?,?,?)")
      .bind(id,threadId,user.id,message || "Shared a post",messageType,messageType === "shared_post" ? sharedPostId : null).run();
    await env.DB.prepare("UPDATE chat_thread_members SET last_read_at=" + NOW + " WHERE thread_id=? AND user_id=?").bind(threadId,user.id).run();
    return json({ success: true, id }, 201);
  }

  const deleteThread = path.match(/^\/api\/chat\/threads\/([^/]+)$/);
  if (deleteThread && method === "DELETE") {
    if (!user) return fail("Unauthorized", 401);
    const result = await env.DB.prepare("UPDATE chat_thread_members SET left_at=" + NOW + " WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(deleteThread[1],user.id).run();
    return result.meta.changes ? json({ success: true }) : fail("Conversation not found", 404);
  }

  const demoReply = path.match(/^\/api\/chat\/threads\/([^/]+)\/demo-reply$/);
  if (demoReply && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const message = str(b.message_text, 1000);
    if (!message) return fail("Message text is required");
    const peer = await env.DB.prepare(`SELECT u.id FROM chat_thread_members mine
      JOIN chat_thread_members other ON other.thread_id=mine.thread_id AND other.user_id<>mine.user_id
      JOIN chat_threads t ON t.id=mine.thread_id
      JOIN users u ON u.id=other.user_id
      WHERE mine.thread_id=? AND mine.user_id=? AND mine.left_at IS NULL AND other.left_at IS NULL
      AND t.thread_type='direct' AND u.is_demo=1 AND u.account_status='active' AND u.deleted_at IS NULL LIMIT 1`).bind(demoReply[1],user.id).first<{ id: string }>();
    if (!peer) return fail("Demo conversation not found", 404);
    const id = uuid();
    await env.DB.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,message_text) VALUES(?,?,?,?)").bind(id,demoReply[1],peer.id,message).run();
    return json({ success: true, id }, 201);
  }

  if (path === "/api/notifications" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const kind = str(b.kind, 20) || "system";
    const title = str(b.title, 160);
    const message = str(b.body, 1000);
    if (kind !== "system" || !title) return fail("Invalid notification");
    const requestedLink = str(b.link_url, 300);
    const linkMatch = requestedLink.match(/^\/(post|listing|seller|chat)\/([0-9a-f-]{36})$/i);
    const linkUrl = linkMatch && UUID.test(linkMatch[2]) ? requestedLink : null;
    const id = uuid();
    await env.DB.prepare("INSERT INTO notifications(id,recipient_id,actor_id,notification_type,entity_type,entity_id,title,body,link_url) VALUES(?,?,?,'system','system',NULL,?,?,?)")
      .bind(id,user.id,user.id,title,message || null,linkUrl).run();
    return json({ success: true, id }, 201);
  }

  if (path === "/api/report-reasons" && method === "GET") {
    const targetType = str(url.searchParams.get("target_type"), 20);
    const common = [
      ["spam","Spam or misleading content"],["harassment","Harassment or bullying"],["hate_speech","Hate speech"],
      ["violence","Violence or threats"],["nudity","Nudity or sexual content"],["misinformation","False information"],["scam","Fraud or scam"],["copyright","Copyright infringement"],["other","Other"]
    ];
    const reasonsByType: Record<string, string[]> = {
      post: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","copyright","other"],
      comment: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","copyright","other"],
      user: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","impersonation","other"],
      message: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","other"],
      listing: ["fraud","scam","prohibited_item","misleading_information","counterfeit","spam","wrong_category","other"],
      group: ["spam","harassment","hate_speech","violence","misinformation","inappropriate_content","scam","other"]
    };
    const codes = reasonsByType[targetType];
    if (!codes) return fail("Invalid report target type");
    const labels: Record<string, string> = {
      fraud: "Fraud", prohibited_item: "Prohibited item", misleading_information: "Misleading information",
      counterfeit: "Counterfeit goods", wrong_category: "Wrong category", impersonation: "Impersonation",
      inappropriate_content: "Inappropriate content"
    };
    const rows = codes.map((code,index) => {
      const base = common.find(item => item[0] === code);
      return { code, label: labels[code] || base?.[1] || code, description: null, display_order: index };
    });
    return json({ success: true, data: rows });
  }

  if (path === "/api/reports" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const targetType = str(b.target_type, 20);
    const targetId = str(b.target_id, 64);
    const reason = str(b.reason_code, 40);
    const details = str(b.notes, 2000) || null;
    if (!UUID.test(targetId)) return fail("Invalid report target");
    const allowed: Record<string, string[]> = {
      post: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","copyright","other"],
      comment: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","copyright","other"],
      user: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","impersonation","other"],
      message: ["spam","harassment","hate_speech","violence","nudity","misinformation","scam","other"],
      listing: ["fraud","scam","prohibited_item","misleading_information","counterfeit","spam","wrong_category","other"],
      group: ["spam","harassment","hate_speech","violence","misinformation","inappropriate_content","scam","other"]
    };
    if (!allowed[targetType]?.includes(reason)) return fail("Invalid report reason");
    const id = uuid();
    let changes = 0;
    if (targetType === "post") {
      const target = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(targetId).first();
      if (!target) return fail("Post not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO post_reports(id,post_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    } else if (targetType === "comment") {
      const target = await env.DB.prepare("SELECT id FROM post_comments WHERE id=? AND status='published' AND deleted_at IS NULL").bind(targetId).first();
      if (!target) return fail("Comment not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO comment_reports(id,comment_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    } else if (targetType === "listing") {
      const target = await env.DB.prepare("SELECT id FROM marketplace_listings WHERE id=? AND status='active' AND deleted_at IS NULL").bind(targetId).first();
      if (!target) return fail("Listing not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO marketplace_listing_reports(id,listing_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    } else if (targetType === "user") {
      const target = await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(targetId).first();
      if (!target || targetId === user.id) return fail("User not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO user_reports(id,reported_user_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    } else if (targetType === "message") {
      const target = await env.DB.prepare("SELECT m.id FROM chat_messages m JOIN chat_thread_members tm ON tm.thread_id=m.thread_id WHERE m.id=? AND tm.user_id=? AND tm.left_at IS NULL AND m.sender_id<>? AND m.status<>'deleted'").bind(targetId,user.id,user.id).first();
      if (!target) return fail("Message not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO chat_message_reports(id,message_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    } else {
      const target = await env.DB.prepare("SELECT id FROM communities WHERE id=? AND status='active'").bind(targetId).first();
      if (!target) return fail("Group not found", 404);
      changes = (await env.DB.prepare("INSERT OR IGNORE INTO community_reports(id,community_id,reporter_id,reason,details) VALUES(?,?,?,?,?)").bind(id,targetId,user.id,reason,details).run()).meta.changes;
    }
    if (!changes) return fail("You have already reported this item", 409);
    return json({ success: true, id }, 201);
  }

  return null;
}
