import type { Env, User } from "./types.js";
import { uuid } from "./security.js";

type RouteContext = { url: URL; path: string; method: string; user: User | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ success: false, error: message }, status);
const str = (v: unknown, max = 500) => typeof v === "string" ? v.trim().slice(0, max) : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 32_000) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 32_000) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function notify(env: Env, recipientId: string, actorId: string, type: string, entityType: string, entityId: string, title: string, message: string) {
  try {
    await env.DB.prepare("INSERT INTO notifications(id,recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) VALUES(?,?,?,?,?,?,?,?)")
      .bind(uuid(), recipientId, actorId, type, entityType, entityId, title, message).run();
  } catch { /* A notification failure must not roll back the primary social action. */ }
}

const PROFILE_SELECT = "u.id,u.username,u.display_name,u.avatar_url,u.bio,u.location_city,u.occupation,u.created_at";

export async function handleSocialRoutes(request: Request, env: Env, context: RouteContext): Promise<Response | null> {
  const { url, path, method, user } = context;

  const followRoute = path.match(/^\/api\/profiles\/([^/]+)\/follow(?:\/(follow-status|followers|following|count))?$/);
  if (followRoute) {
    const targetId = decodeURIComponent(followRoute[1]);
    const suffix = followRoute[2];
    if (!UUID.test(targetId)) return fail("Invalid user id", 400);
    if (suffix === "follow-status" && method === "GET") {
      if (!user) return fail("Unauthorized", 401);
      const row = await env.DB.prepare("SELECT 1 AS following FROM user_follows WHERE follower_id=? AND following_id=?").bind(user.id, targetId).first();
      return json({ success: true, following: !!row });
    }
    if (suffix === "count" && method === "GET") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_follows WHERE following_id=?").bind(targetId).first<{ count: number }>();
      return json({ success: true, count: Number(row?.count || 0) });
    }
    if (suffix === "followers" && method === "GET") {
      const rows = await env.DB.prepare(`SELECT ${PROFILE_SELECT},f.created_at AS followed_at FROM user_follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=? AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 100`).bind(targetId).all();
      return json({ success: true, data: rows.results });
    }
    if (suffix === "following" && method === "GET") {
      const rows = await env.DB.prepare(`SELECT ${PROFILE_SELECT},f.created_at AS followed_at FROM user_follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=? AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 100`).bind(targetId).all();
      return json({ success: true, data: rows.results });
    }
    if (suffix === "follow" && (method === "POST" || method === "DELETE")) {
      if (!user) return fail("Unauthorized", 401);
      if (targetId === user.id) return fail("You cannot follow yourself", 400);
      const target = await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(targetId).first();
      if (!target) return fail("Profile not found", 404);
      const blocked = await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id, targetId, targetId, user.id).first();
      if (blocked) return fail("This follow is unavailable", 403);
      if (method === "POST") {
        const result = await env.DB.prepare("INSERT OR IGNORE INTO user_follows(follower_id,following_id) VALUES(?,?)").bind(user.id, targetId).run();
        if (result.meta.changes) await notify(env, targetId, user.id, "new_follower", "user", user.id, "New follower", user.display_name + " started following you.");
        return json({ success: true, following: true });
      }
      await env.DB.prepare("DELETE FROM user_follows WHERE follower_id=? AND following_id=?").bind(user.id, targetId).run();
      return json({ success: true, following: false });
    }
  }

  const followCount = path.match(/^\/api\/profiles\/([^/]+)\/(followers|following)\/count$/);
  if (followCount && method === "GET") {
    const id = decodeURIComponent(followCount[1]);
    if (!UUID.test(id)) return fail("Invalid user id", 400);
    const column = followCount[2] === "followers" ? "following_id" : "follower_id";
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM user_follows WHERE " + column + "=?").bind(id).first<{ count: number }>();
    return json({ success: true, count: Number(row?.count || 0) });
  }

  if (path === "/api/me/social-summary" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const [followers, following, liked, saved] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE following_id=?").bind(user.id).first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE follower_id=?").bind(user.id).first<{ n: number }>(),
      env.DB.prepare("SELECT post_id FROM post_reactions WHERE user_id=? AND reaction_type='like' ORDER BY created_at DESC LIMIT 500").bind(user.id).all<{ post_id: string }>(),
      env.DB.prepare("SELECT post_id FROM post_bookmarks WHERE user_id=? ORDER BY created_at DESC LIMIT 500").bind(user.id).all<{ post_id: string }>(),
    ]);
    return json({ success: true, data: { followers_count: Number(followers?.n || 0), following_count: Number(following?.n || 0), liked_post_ids: liked.results.map(x => x.post_id), saved_post_ids: saved.results.map(x => x.post_id) } });
  }

  if (path === "/api/me/friends" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT ${PROFILE_SELECT} FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a_id=? THEN f.user_b_id ELSE f.user_a_id END WHERE f.user_a_id=? OR f.user_b_id=? ORDER BY f.created_at DESC LIMIT 100`).bind(user.id, user.id, user.id).all();
    return json({ success: true, data: rows.results });
  }
  if (path === "/api/me/follow-requests" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT fr.id AS request_id,fr.requester_id AS id,u.username,u.display_name,u.avatar_url,u.bio,fr.created_at FROM friend_requests fr JOIN users u ON u.id=fr.requester_id WHERE fr.recipient_id=? AND fr.status='pending' ORDER BY fr.created_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: rows.results });
  }
  const friendAction = path.match(/^\/api\/me\/follow-requests\/([^/]+)(?:\/(accept))?$/);
  if (friendAction && (method === "POST" || method === "DELETE")) {
    if (!user) return fail("Unauthorized", 401);
    const requesterId = decodeURIComponent(friendAction[1]);
    if (!UUID.test(requesterId) || requesterId === user.id) return fail("Invalid request", 400);
    const req = await env.DB.prepare("SELECT id FROM friend_requests WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(requesterId, user.id).first<{ id: string }>();
    if (!req) return fail("Follow request not found", 404);
    if (method === "DELETE") {
      await env.DB.prepare("UPDATE friend_requests SET status='rejected',responded_at=" + NOW + ",updated_at=" + NOW + " WHERE id=?").bind(req.id).run();
      return json({ success: true });
    }
    if (friendAction[2] !== "accept") return fail("Unknown action", 404);
    const [a, b] = [requesterId, user.id].sort();
    await env.DB.batch([
      env.DB.prepare("UPDATE friend_requests SET status='accepted',responded_at=" + NOW + ",updated_at=" + NOW + " WHERE id=?").bind(req.id),
      env.DB.prepare("INSERT OR IGNORE INTO friendships(user_a_id,user_b_id,source_request_id) VALUES(?,?,?)").bind(a, b, req.id),
    ]);
    await notify(env, requesterId, user.id, "friend_request_accepted", "user", user.id, "Friend request accepted", user.display_name + " accepted your friend request.");
    return json({ success: true });
  }

  const postRoute = path.match(/^\/api\/posts\/([^/]+)(?:\/(like|my-state|save|comments|share|archive|restore))?$/);
  if (postRoute) {
    const postId = decodeURIComponent(postRoute[1]);
    const action = postRoute[2] || "";
    if (action === "comments" && method === "GET") {
      const rows = await env.DB.prepare(`SELECT c.id,c.post_id,c.content AS body,c.author_id AS user_id,c.created_at,c.status AS moderation_status,u.username,u.avatar_url FROM post_comments c JOIN users u ON u.id=c.author_id JOIN posts p ON p.id=c.post_id WHERE c.post_id=? AND c.status='published' AND c.deleted_at IS NULL AND p.status='published' AND p.deleted_at IS NULL ORDER BY c.created_at ASC LIMIT 200`).bind(postId).all();
      return json({ success: true, data: rows.results });
    }
    if (action === "comments" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const b = await body(request); if (!b) return fail("Valid JSON body required");
      const content = str(b.body, 2000);
      if (!content) return fail("Comment cannot be empty");
      const post = await env.DB.prepare("SELECT author_id,comments_enabled,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; comments_enabled: number; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at || !post.comments_enabled) return fail("Comments are unavailable", 404);
      const id = uuid();
      await env.DB.prepare("INSERT INTO post_comments(id,post_id,author_id,content) VALUES(?,?,?,?)").bind(id, postId, user.id, content).run();
      if (post.author_id !== user.id) await notify(env, post.author_id, user.id, "post_comment", "post", postId, "New comment", user.display_name + " commented on your post.");
      return json({ success: true, id }, 201);
    }
    if (action === "my-state" && method === "GET") {
      if (!user) return fail("Unauthorized", 401);
      const [liked, saved] = await Promise.all([
        env.DB.prepare("SELECT 1 FROM post_reactions WHERE post_id=? AND user_id=?").bind(postId, user.id).first(),
        env.DB.prepare("SELECT 1 FROM post_bookmarks WHERE post_id=? AND user_id=?").bind(postId, user.id).first(),
      ]);
      return json({ success: true, liked: !!liked, saved: !!saved });
    }
    if (action === "like" && (method === "POST" || method === "DELETE")) {
      if (!user) return fail("Unauthorized", 401);
      const post = await env.DB.prepare("SELECT author_id,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at) return fail("Post not found", 404);
      if (method === "POST") {
        const result = await env.DB.prepare("INSERT OR IGNORE INTO post_reactions(post_id,user_id,reaction_type) VALUES(?,?,'like')").bind(postId, user.id).run();
        if (result.meta.changes && post.author_id !== user.id) await notify(env, post.author_id, user.id, "post_reaction", "post", postId, "New like", user.display_name + " liked your post.");
      } else {
        await env.DB.prepare("DELETE FROM post_reactions WHERE post_id=? AND user_id=?").bind(postId, user.id).run();
      }
      return json({ success: true, liked: method === "POST" });
    }
    if (action === "save" && (method === "POST" || method === "DELETE")) {
      if (!user) return fail("Unauthorized", 401);
      const post = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(postId).first();
      if (!post) return fail("Post not found", 404);
      if (method === "POST") await env.DB.prepare("INSERT OR IGNORE INTO post_bookmarks(user_id,post_id) VALUES(?,?)").bind(user.id, postId).run();
      else await env.DB.prepare("DELETE FROM post_bookmarks WHERE user_id=? AND post_id=?").bind(user.id, postId).run();
      return json({ success: true, saved: method === "POST" });
    }
    if (action === "share" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const b = await body(request);
      const visibility = str(b?.visibility, 20) || "public";
      if (!["public", "followers", "friends", "private"].includes(visibility)) return fail("Invalid share visibility");
      const post = await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(postId).first();
      if (!post) return fail("Post not found", 404);
      await env.DB.prepare("INSERT OR IGNORE INTO post_shares(id,post_id,user_id,share_message,visibility) VALUES(?,?,?,?,?)").bind(uuid(), postId, user.id, str(b?.message, 500) || null, visibility).run();
      return json({ success: true });
    }
    if (action === "archive" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const r = await env.DB.prepare("UPDATE posts SET status='archived' WHERE id=? AND author_id=? AND status='published' AND deleted_at IS NULL").bind(postId, user.id).run();
      return r.meta.changes ? json({ success: true }) : fail("Post not found", 404);
    }
    if (action === "restore" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const r = await env.DB.prepare("UPDATE posts SET status='published',published_at=COALESCE(published_at," + NOW + ") WHERE id=? AND author_id=? AND status='archived' AND deleted_at IS NULL").bind(postId, user.id).run();
      return r.meta.changes ? json({ success: true }) : fail("Archived post not found", 404);
    }
    if (action === "" && method === "DELETE") {
      if (!user) return fail("Unauthorized", 401);
      const r = await env.DB.prepare("UPDATE posts SET status='removed',deleted_at=" + NOW + " WHERE id=? AND author_id=? AND deleted_at IS NULL").bind(postId, user.id).run();
      return r.meta.changes ? json({ success: true }) : fail("Post not found", 404);
    }
  }

  if (path === "/api/posts/saved" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT p.id,p.author_id,p.content,p.post_type,p.visibility,p.published_at,p.created_at,u.username,u.display_name,u.avatar_url FROM post_bookmarks b JOIN posts p ON p.id=b.post_id JOIN users u ON u.id=p.author_id WHERE b.user_id=? AND p.status='published' AND p.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: rows.results });
  }
  if (path === "/api/posts/mine" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT p.id,p.author_id,p.content,p.post_type,p.visibility,p.status,p.created_at,(SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id) AS likes_count,(SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count FROM posts p WHERE p.author_id=? AND p.deleted_at IS NULL AND p.status IN ('published','draft') ORDER BY p.created_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: rows.results });
  }
  if (path === "/api/posts/archived" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT p.id,p.author_id,p.content,p.post_type,p.visibility,p.status,p.created_at FROM posts p WHERE p.author_id=? AND p.status='archived' AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: rows.results });
  }

  if (path === "/api/me/blocked-users" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,b.created_at FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: rows.results });
  }
  const unblock = path.match(/^\/api\/me\/blocked-users\/([^/]+)$/);
  if (unblock && method === "DELETE") {
    if (!user) return fail("Unauthorized", 401);
    const id = decodeURIComponent(unblock[1]);
    await env.DB.prepare("DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?").bind(user.id, id).run();
    return json({ success: true });
  }

  if (path === "/api/me/privacy" && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT profile_visibility,allow_tagging FROM user_privacy_settings WHERE user_id=?").bind(user.id).first<{ profile_visibility: string; allow_tagging: number }>();
      const userRow = await env.DB.prepare("SELECT profile_visibility FROM users WHERE id=?").bind(user.id).first<{ profile_visibility: string }>();
      return json({ success: true, data: { profile_visibility: row?.profile_visibility || userRow?.profile_visibility || "public", allow_tagging: row ? (row.allow_tagging ? "everyone" : "nobody") : "everyone" } });
    }
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const requestedVisibility = str(b.profile_visibility, 20) || "public";
    const visibility = requestedVisibility === "nobody" ? "private" : requestedVisibility;
    if (!["public", "followers", "private"].includes(visibility)) return fail("Invalid profile visibility");
    const tagging = str(b.allow_tagging, 20) || "everyone";
    if (!["everyone", "friends", "nobody"].includes(tagging)) return fail("Invalid tagging preference");
    await env.DB.prepare("INSERT INTO user_privacy_settings(user_id,profile_visibility,allow_tagging) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_visibility=excluded.profile_visibility,allow_tagging=excluded.allow_tagging,updated_at=" + NOW).bind(user.id, visibility, tagging === "everyone" ? 1 : 0).run();
    return json({ success: true });
  }

  if (path === "/api/me/notification-preferences" && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    const read = async () => {
      const row = await env.DB.prepare("SELECT push_enabled,email_enabled,social_notifications_enabled,comment_notifications_enabled,follower_notifications_enabled FROM notification_preferences WHERE user_id=?").bind(user.id).first<Record<string, number>>();
      return { push: !!(row?.push_enabled ?? 1), email: !!(row?.email_enabled ?? 1), sms: false, follows: !!(row?.follower_notifications_enabled ?? 1), comments: !!(row?.comment_notifications_enabled ?? 1), orders: false };
    };
    if (method === "GET") return json({ success: true, data: await read() });
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const current = await read();
    const val = (key: string) => typeof b[key] === "boolean" ? (b[key] ? 1 : 0) : (current as Record<string, boolean>)[key] ? 1 : 0;
    await env.DB.prepare("INSERT INTO notification_preferences(user_id,push_enabled,email_enabled,social_notifications_enabled,comment_notifications_enabled,follower_notifications_enabled) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=excluded.push_enabled,email_enabled=excluded.email_enabled,social_notifications_enabled=excluded.social_notifications_enabled,comment_notifications_enabled=excluded.comment_notifications_enabled,follower_notifications_enabled=excluded.follower_notifications_enabled,updated_at=" + NOW)
      .bind(user.id, val("push"), val("email"), val("orders"), val("comments"), val("follows")).run();
    return json({ success: true });
  }

  if (path === "/api/me/personal-details" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const row = await env.DB.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,bio,date_of_birth,country_code,location_region,location_city,occupation,is_premium,profile_visibility FROM users WHERE id=? AND deleted_at IS NULL").bind(user.id).first<Record<string, unknown>>();
    return json({ success: true, data: row ? { ...row, is_email_verified: !!row.email_verified, is_phone_verified: !!row.phone_verified } : null });
  }
  if (path === "/api/me/personal-details" && method === "PATCH") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const allowed = ["username", "phone", "bio", "date_of_birth", "country_code", "location_region", "location_city", "occupation"];
    const fields = allowed.filter(k => Object.prototype.hasOwnProperty.call(b, k));
    if (!fields.length) return fail("No supported personal details supplied");
    const values: unknown[] = [];
    const assignments = fields.map(k => {
      const v = b[k];
      if (v !== null && typeof v !== "string") return "";
      const value = typeof v === "string" ? v.trim() : null;
      if (k === "username") {
        const normalized = str(value, 30).toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(normalized)) return "";
        values.push(normalized); return "username=?";
      }
      if (k === "date_of_birth" && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
      if (k === "phone" && value !== null && value.length < 7) return "";
      values.push(value === null ? null : value.slice(0, k === "bio" ? 2000 : 255));
      return k + "=?";
    });
    if (assignments.some(x => !x)) return fail("Invalid personal detail value");
    if (b.username !== undefined) {
      const taken = await env.DB.prepare("SELECT 1 FROM users WHERE lower(username)=? AND id<>?").bind(str(b.username, 30).toLowerCase(), user.id).first();
      if (taken) return fail("Username is already taken", 409);
    }
    values.push(user.id);
    await env.DB.prepare("UPDATE users SET " + assignments.join(",") + ",updated_at=" + NOW + " WHERE id=?").bind(...values).run();
    return json({ success: true });
  }

  return null;
}
