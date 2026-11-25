import type { Env, User } from "./types.js";
import { uuid } from "./security.js";
import { hydratePosts } from "./media.js";

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


const INTEREST_STOP_WORDS = new Set(["about","after","again","also","because","been","before","being","between","could","from","have","here","into","just","more","most","much","only","other","over","same","some","such","than","that","their","them","then","there","these","they","this","those","through","under","very","what","when","where","which","while","with","would","your","you","the","and","for","are","was","were","has","had","but","not","you","our","out","all","can","will","who","how","why","its","it's","his","her","she","him","they","them","una","les","des","dans","pour","avec","sur","est","sont","une","que","qui","pas","plus","tout","vous","nous","aux","par","comme","mais","donc"]);
function extractInterestTopics(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/)
    .filter(token => token.length >= 3 && token.length <= 28 && !INTEREST_STOP_WORDS.has(token) && !/^\\d+$/.test(token)))].slice(0, 8);
}

const PROFILE_SELECT = "u.id,u.username,u.display_name,u.avatar_url,u.bio,u.location_city,u.occupation,u.created_at";

async function canViewProfile(db: D1Database, viewerId: string | null, profileId: string, visibility: string): Promise<boolean> {
  if (viewerId === profileId) return true;
  if (!viewerId) return visibility === "public";
  const blocked = await db.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(viewerId,profileId,profileId,viewerId).first();
  if (blocked) return false;
  if (visibility === "public") return true;
  if (visibility === "followers") return !!(await db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?").bind(viewerId, profileId).first());
  return false;
}

async function canViewPost(db: D1Database, viewerId: string | null, authorId: string, visibility: string): Promise<boolean> {
  if (viewerId === authorId) return true;
  if (viewerId) {
    const blocked = await db.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(viewerId,authorId,authorId,viewerId).first();
    if (blocked) return false;
  }
  if (visibility === "public") return true;
  if (!viewerId) return false;
  if (visibility === "followers") {
    return !!(await db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?").bind(viewerId, authorId).first());
  }
  if (visibility === "friends") {
    const [a, b] = [viewerId, authorId].sort();
    return !!(await db.prepare("SELECT 1 FROM friendships WHERE user_a_id=? AND user_b_id=?").bind(a, b).first());
  }
  return false;
}

export async function handleSocialRoutes(request: Request, env: Env, context: RouteContext): Promise<Response | null> {
  const { url, path, method, user } = context;


  if (path === "/api/feed" && method === "GET") {
    const viewerId = user?.id || null;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 40);
    const offset = Math.min(Math.max(Number(url.searchParams.get("offset") || 0), 0), 500);
    const feedType = str(url.searchParams.get("type"), 12) || "all";
    if (!["all", "videos", "posts"].includes(feedType)) return fail("Invalid feed type");
    const rows = await env.DB.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url,u.is_premium,
      (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id AND r.reaction_type='like') AS likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count,
      (SELECT COUNT(*) FROM post_shares s WHERE s.post_id=p.id) AS shares_count,
      CASE WHEN ? IS NULL THEN 0 WHEN p.author_id=? THEN 130
        WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id) THEN 100
        WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=p.author_id AND f.following_id=?) THEN 76
        WHEN EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=p.author_id) OR (fr.user_a_id=p.author_id AND fr.user_b_id=?)) THEN 82
        WHEN EXISTS(SELECT 1 FROM user_follows f1 JOIN user_follows f2 ON f2.follower_id=f1.following_id WHERE f1.follower_id=? AND f2.following_id=p.author_id) THEN 48
        ELSE 0 END AS relationship_score,
      COALESCE((SELECT SUM(i.score) FROM user_interest_signals i
        WHERE i.user_id=? AND i.score>0 AND instr(lower(COALESCE(p.content,'')),i.topic_key)>0),0) AS interest_score,
      CASE WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id) THEN 'Following'
        WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=p.author_id AND f.following_id=?) THEN 'Follows you'
        WHEN EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=p.author_id) OR (fr.user_a_id=p.author_id AND fr.user_b_id=?)) THEN 'Friend'
        ELSE 'Suggested for you' END AS feed_reason,
      CASE WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id) THEN 1 ELSE 0 END AS is_following_author,
      CASE WHEN EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=p.author_id AND f.following_id=?) THEN 1 ELSE 0 END AS is_followed_by_author,
      CASE WHEN EXISTS(SELECT 1 FROM post_reactions r WHERE r.post_id=p.id AND r.user_id=? AND r.reaction_type='like') THEN 1 ELSE 0 END AS is_liked,
      CASE WHEN EXISTS(SELECT 1 FROM post_bookmarks b WHERE b.post_id=p.id AND b.user_id=?) THEN 1 ELSE 0 END AS is_saved,
      v.id AS video_id,v.duration_seconds,v.thumbnail_key,v.hls_key
      FROM posts p JOIN users u ON u.id=p.author_id
      LEFT JOIN video_assets v ON v.post_id=p.id AND v.status='ready'
      WHERE p.status='published' AND p.deleted_at IS NULL
        AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
        AND (?='all' OR (?='videos' AND p.post_type='video' AND v.id IS NOT NULL) OR (?='posts' AND (p.post_type IS NULL OR p.post_type<>'video')))
        AND (p.visibility='public' OR p.author_id=? OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id))
          OR (p.visibility='friends' AND EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=p.author_id) OR (fr.user_a_id=p.author_id AND fr.user_b_id=?))))
        AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?)))
        AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_feed_post_preferences fp WHERE fp.user_id=? AND fp.post_id=p.id AND fp.preference='not_interested'))
      ORDER BY (relationship_score + interest_score +
        MIN(20,(SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id)*0.4 +
          (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL)*0.8 +
          (SELECT COUNT(*) FROM post_shares s WHERE s.post_id=p.id)*1.2)) DESC,
        COALESCE(p.published_at,p.created_at) DESC
      LIMIT ? OFFSET ?`)
      .bind(viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,
        feedType,feedType,feedType,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,viewerId,limit,offset)
      .all<Record<string, unknown>>();
    const hydrated = await hydratePosts(env, url.origin, rows.results);
    return json({ success: true, data: hydrated, pagination: { limit, offset, has_more: rows.results.length === limit } });
  }

  if (path === "/api/feed/events" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request);
    if (!b) return fail("Valid JSON body required");
    const postId = str(b.post_id, 64);
    const eventType = str(b.event_type, 24);
    const allowed = ["impression", "dwell", "video_watch", "video_complete", "skip", "like", "comment", "save", "share"];
    if (!UUID.test(postId) || !allowed.includes(eventType)) return fail("Invalid feed event");
    const dwellMs = Math.min(Math.max(Math.trunc(Number(b.dwell_ms) || 0), 0), 300000);
    const watchMs = Math.min(Math.max(Math.trunc(Number(b.watch_ms) || 0), 0), 300000);
    const post = await env.DB.prepare("SELECT author_id,visibility,content,post_type,status,deleted_at FROM posts WHERE id=?").bind(postId)
      .first<{author_id:string;visibility:string;content:string;post_type:string;status:string;deleted_at:string|null}>();
    if (!post || post.status !== "published" || post.deleted_at || !(await canViewPost(env.DB,user.id,post.author_id,post.visibility))) return fail("Post not found",404);
    await env.DB.prepare("INSERT INTO post_engagement_events(id,user_id,post_id,event_type,dwell_ms,watch_ms,completed,source) VALUES(?,?,?,?,?,?,?,?)")
      .bind(uuid(),user.id,postId,eventType,dwellMs,watchMs,b.completed===true?1:0,str(b.source,24)||"feed").run();
    let weight = 0;
    if (eventType === "dwell" && dwellMs >= 2500) weight = Math.min(8, 2 + dwellMs / 6000);
    if (eventType === "video_watch" && watchMs >= 3000) weight = Math.min(10, 2 + watchMs / 10000);
    if (eventType === "video_complete" || (eventType === "video_watch" && b.completed === true)) weight = 12;
    if (eventType === "like") weight = 7;
    if (eventType === "comment") weight = 9;
    if (eventType === "save") weight = 12;
    if (eventType === "share") weight = 14;
    if (eventType === "skip") weight = -3;
    if (eventType === "dwell" && dwellMs < 2500) weight = 0;
    if (weight !== 0) {
      const topics = extractInterestTopics(post.content);
      for (const topic of topics) {
        await env.DB.prepare("INSERT INTO user_interest_signals(user_id,topic_key,score) VALUES(?,?,?) ON CONFLICT(user_id,topic_key) DO UPDATE SET score=MAX(-100,MIN(100,user_interest_signals.score+excluded.score)),updated_at=" + NOW)
          .bind(user.id,topic,weight / Math.max(1,topics.length)).run();
      }
    }
    return json({success:true,recorded:true});
  }

  if (path === "/api/me/feed-interests" && (method === "GET" || method === "DELETE")) {
    if (!user) return fail("Unauthorized",401);
    if (method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM user_interest_signals WHERE user_id=?").bind(user.id),
        env.DB.prepare("DELETE FROM post_engagement_events WHERE user_id=?").bind(user.id)
      ]);
      return json({success:true,reset:true});
    }
    const interests = await env.DB.prepare("SELECT topic_key,ROUND(score,2) AS score,updated_at FROM user_interest_signals WHERE user_id=? AND score>0 ORDER BY score DESC,updated_at DESC LIMIT 50").bind(user.id).all();
    return json({success:true,data:interests.results});
  }

  const profilePosts = path.match(/^\/api\/profiles\/([^/]+)\/posts$/);
  if (profilePosts && method === "GET") {
    const targetKey = decodeURIComponent(profilePosts[1]);
    const profile = await env.DB.prepare("SELECT id,profile_visibility FROM users WHERE (id=? OR lower(username)=lower(?)) AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(targetKey,targetKey).first<{ id: string; profile_visibility: string }>();
    if (!profile) return fail("Profile not found", 404);
    const targetId = profile.id;
    if (!(await canViewProfile(env.DB, user?.id || null, targetId, profile.profile_visibility))) return fail("Profile not found", 404);
    const rows = await env.DB.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url,u.is_premium,
      (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id) AS likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count
      FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.author_id=? AND p.status='published' AND p.deleted_at IS NULL
      ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 50`).bind(targetId).all<Record<string, unknown>>();
    const viewerId = user?.id || null;
    let isFollower = false, isFriend = false;
    if (viewerId && viewerId !== targetId) {
      isFollower = !!(await env.DB.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?").bind(viewerId,targetId).first());
      const [a,b] = [viewerId,targetId].sort();
      isFriend = !!(await env.DB.prepare("SELECT 1 FROM friendships WHERE user_a_id=? AND user_b_id=?").bind(a,b).first());
    }
    const visible = rows.results.filter(post => post.visibility === "public" || post.author_id === viewerId || (post.visibility === "followers" && isFollower) || (post.visibility === "friends" && isFriend));
    return json({ success: true, data: await hydratePosts(env,url.origin,visible) });
  }

  const followRoute = path.match(/^\/api\/profiles\/([^/]+)\/(follow|follow-status|followers|following)$/);
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
    if ((suffix === "followers" || suffix === "following") && method === "GET") {
      const profile = await env.DB.prepare("SELECT profile_visibility FROM users WHERE id=? AND deleted_at IS NULL").bind(targetId).first<{ profile_visibility: string }>();
      if (!profile || !(await canViewProfile(env.DB, user?.id || null, targetId, profile.profile_visibility))) return fail("Profile not found", 404);
      const rows = suffix === "followers"
        ? await env.DB.prepare(`SELECT ${PROFILE_SELECT},f.created_at AS followed_at FROM user_follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=? AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 100`).bind(targetId).all()
        : await env.DB.prepare(`SELECT ${PROFILE_SELECT},f.created_at AS followed_at FROM user_follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=? AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 100`).bind(targetId).all();
      return json({ success: true, data: rows.results });
    }
    if (suffix === "follow" && (method === "POST" || method === "DELETE")) {
      if (!user) return fail("Unauthorized", 401);
      if (targetId === user.id) return fail("You cannot follow yourself", 400);
      const target = await env.DB.prepare("SELECT id,profile_visibility FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(targetId).first<{ id: string; profile_visibility: string }>();
      if (!target) return fail("Profile not found", 404);
      if (target.profile_visibility === "private") return fail("This profile is private", 403);
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

  const postRoute = path.match(/^\/api\/posts\/([^/]+)(?:\/(like|my-state|save|comments|share|archive|restore|not-interested))?$/);
  if (postRoute) {
    const postId = decodeURIComponent(postRoute[1]);
    const action = postRoute[2] || "";
    if (action === "" && method === "GET") {
      const post = await env.DB.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url,u.is_premium,
        (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id) AS likes_count,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count
        FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND p.deleted_at IS NULL
        AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL`).bind(postId).first<Record<string, unknown> & { author_id: string; visibility: string }>();
      if (!post || !(await canViewPost(env.DB, user?.id || null, post.author_id, post.visibility))) return fail("Post not found", 404);
      const [hydrated] = await hydratePosts(env,url.origin,[post]);
      return json({ success: true, data: hydrated });
    }
    if (action === "comments" && method === "GET") {
      const post = await env.DB.prepare("SELECT author_id,visibility,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; visibility: string; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at || !(await canViewPost(env.DB, user?.id || null, post.author_id, post.visibility))) return fail("Post not found", 404);
      const rows = await env.DB.prepare(`SELECT c.id,c.post_id,c.content AS body,c.author_id AS user_id,c.created_at,c.status AS moderation_status,u.username,u.avatar_url FROM post_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND c.status='published' AND c.deleted_at IS NULL ORDER BY c.created_at ASC LIMIT 200`).bind(postId).all();
      return json({ success: true, data: rows.results });
    }
    if (action === "comments" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const b = await body(request); if (!b) return fail("Valid JSON body required");
      const content = str(b.body, 2000);
      if (!content) return fail("Comment cannot be empty");
      const post = await env.DB.prepare("SELECT author_id,visibility,comments_enabled,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; visibility: string; comments_enabled: number; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at || !post.comments_enabled || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Comments are unavailable", 404);
      const id = uuid();
      await env.DB.prepare("INSERT INTO post_comments(id,post_id,author_id,content) VALUES(?,?,?,?)").bind(id, postId, user.id, content).run();
      if (post.author_id !== user.id) await notify(env, post.author_id, user.id, "post_comment", "post", postId, "New comment", user.display_name + " commented on your post.");
      return json({ success: true, id }, 201);
    }
    if (action === "not-interested" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const b = await body(request);
      const preference = str(b?.preference, 30) || "not_interested";
      if (!["interested", "not_interested"].includes(preference)) return fail("Invalid feed preference");
      const post = await env.DB.prepare("SELECT author_id,visibility FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(postId).first<{ author_id: string; visibility: string }>();
      if (!post || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Post not found", 404);
      await env.DB.prepare("INSERT INTO user_feed_post_preferences(user_id,post_id,preference) VALUES(?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET preference=excluded.preference,updated_at=" + NOW)
        .bind(user.id, postId, preference).run();
      return json({ success: true, preference });
    }
    if (action === "my-state" && method === "GET") {
      if (!user) return fail("Unauthorized", 401);
      const post = await env.DB.prepare("SELECT author_id,visibility,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; visibility: string; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Post not found", 404);
      const [liked, saved] = await Promise.all([
        env.DB.prepare("SELECT 1 FROM post_reactions WHERE post_id=? AND user_id=?").bind(postId, user.id).first(),
        env.DB.prepare("SELECT 1 FROM post_bookmarks WHERE post_id=? AND user_id=?").bind(postId, user.id).first(),
      ]);
      return json({ success: true, liked: !!liked, saved: !!saved, data: { liked: !!liked, saved: !!saved } });
    }
    if (action === "like" && (method === "POST" || method === "DELETE")) {
      if (!user) return fail("Unauthorized", 401);
      const post = await env.DB.prepare("SELECT author_id,visibility,status,deleted_at FROM posts WHERE id=?").bind(postId).first<{ author_id: string; visibility: string; status: string; deleted_at: string | null }>();
      if (!post || post.status !== "published" || post.deleted_at || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Post not found", 404);
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
      const post = await env.DB.prepare("SELECT author_id,visibility FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(postId).first<{ author_id: string; visibility: string }>();
      if (!post || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Post not found", 404);
      if (method === "POST") await env.DB.prepare("INSERT OR IGNORE INTO post_bookmarks(user_id,post_id) VALUES(?,?)").bind(user.id, postId).run();
      else await env.DB.prepare("DELETE FROM post_bookmarks WHERE user_id=? AND post_id=?").bind(user.id, postId).run();
      return json({ success: true, saved: method === "POST" });
    }
    if (action === "share" && method === "POST") {
      if (!user) return fail("Unauthorized", 401);
      const b = await body(request);
      const visibility = str(b?.visibility, 20) || "public";
      if (!["public", "followers", "friends", "private"].includes(visibility)) return fail("Invalid share visibility");
      const post = await env.DB.prepare("SELECT author_id,visibility FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").bind(postId).first<{ author_id: string; visibility: string }>();
      if (!post || !(await canViewPost(env.DB, user.id, post.author_id, post.visibility))) return fail("Post not found", 404);
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
    const rows = await env.DB.prepare(`SELECT p.*,u.username,u.display_name,u.avatar_url FROM post_bookmarks b JOIN posts p ON p.id=b.post_id JOIN users u ON u.id=p.author_id WHERE b.user_id=? AND p.status='published' AND p.deleted_at IS NULL AND (p.visibility='public' OR p.author_id=? OR (p.visibility='followers' AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.following_id=p.author_id)) OR (p.visibility='friends' AND EXISTS(SELECT 1 FROM friendships fr WHERE (fr.user_a_id=? AND fr.user_b_id=p.author_id) OR (fr.user_a_id=p.author_id AND fr.user_b_id=?)))) AND NOT EXISTS(SELECT 1 FROM user_blocks bl WHERE (bl.blocker_id=? AND bl.blocked_id=p.author_id) OR (bl.blocker_id=p.author_id AND bl.blocked_id=?)) ORDER BY b.created_at DESC LIMIT 100`).bind(user.id,user.id,user.id,user.id,user.id,user.id,user.id).all();
    return json({ success: true, data: await hydratePosts(env,url.origin,rows.results as Array<Record<string,unknown>>) });
  }
  if (path === "/api/posts/mine" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id) AS likes_count,(SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.status='published' AND c.deleted_at IS NULL) AS comments_count FROM posts p WHERE p.author_id=? AND p.deleted_at IS NULL AND p.status IN ('published','draft') ORDER BY p.created_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: await hydratePosts(env,url.origin,rows.results as Array<Record<string,unknown>>) });
  }
  if (path === "/api/posts/archived" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT p.* FROM posts p WHERE p.author_id=? AND p.status='archived' AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 100`).bind(user.id).all();
    return json({ success: true, data: await hydratePosts(env,url.origin,rows.results as Array<Record<string,unknown>>) });
  }

  if (path === "/api/me/blocked-users" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const blockedId = str(b.user_id, 64);
    if (!UUID.test(blockedId) || blockedId === user.id) return fail("Invalid user id");
    const target = await env.DB.prepare("SELECT id FROM users WHERE id=? AND deleted_at IS NULL").bind(blockedId).first();
    if (!target) return fail("User not found", 404);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO user_blocks(blocker_id,blocked_id,reason) VALUES(?,?,?)").bind(user.id, blockedId, str(b.reason, 500) || null),
      env.DB.prepare("DELETE FROM user_follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)").bind(user.id, blockedId, blockedId, user.id),
      env.DB.prepare("DELETE FROM friendships WHERE (user_a_id=? AND user_b_id=?) OR (user_a_id=? AND user_b_id=?)").bind(...[user.id, blockedId].sort(), ...[user.id, blockedId].sort()),
      env.DB.prepare("UPDATE friend_requests SET status='cancelled',responded_at=" + NOW + ",updated_at=" + NOW + " WHERE status='pending' AND ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))").bind(user.id, blockedId, blockedId, user.id)
    ]);
    return json({ success: true });
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
      const row = await env.DB.prepare("SELECT profile_visibility,allow_tagging,tagging_visibility,default_post_visibility FROM user_privacy_settings WHERE user_id=?").bind(user.id).first<{ profile_visibility: string; allow_tagging: number; tagging_visibility: string; default_post_visibility: string }>();
      const userRow = await env.DB.prepare("SELECT profile_visibility FROM users WHERE id=?").bind(user.id).first<{ profile_visibility: string }>();
      const storedVisibility = row?.profile_visibility || userRow?.profile_visibility || "public";
      return json({ success: true, data: {
        profile_visibility: storedVisibility === "private" ? "nobody" : storedVisibility,
        allow_tagging: row?.tagging_visibility || (row?.allow_tagging === 0 ? "nobody" : "everyone"),
        default_post_visibility: row?.default_post_visibility || "public"
      } });
    }
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const requestedVisibility = str(b.profile_visibility, 20) || "public";
    const visibility = requestedVisibility === "nobody" ? "private" : requestedVisibility;
    if (!["public", "followers", "private"].includes(visibility)) return fail("Invalid profile visibility");
    const tagging = str(b.allow_tagging, 20) || "everyone";
    const postVisibility = str(b.default_post_visibility, 20) || "public";
    if (!["everyone", "friends", "nobody"].includes(tagging)) return fail("Invalid tagging preference");
    if (!["public", "followers", "friends", "private"].includes(postVisibility)) return fail("Invalid default post visibility");
    await env.DB.prepare("INSERT INTO user_privacy_settings(user_id,profile_visibility,allow_tagging,tagging_visibility,default_post_visibility) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_visibility=excluded.profile_visibility,allow_tagging=excluded.allow_tagging,tagging_visibility=excluded.tagging_visibility,default_post_visibility=excluded.default_post_visibility,updated_at=" + NOW)
      .bind(user.id, visibility, tagging === "nobody" ? 0 : 1, tagging, postVisibility).run();
    return json({ success: true });
  }

  if (path === "/api/me/tagging-settings" && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT tagging_audience,mentioning_visibility FROM user_privacy_settings WHERE user_id=?").bind(user.id).first<{ tagging_audience: string; mentioning_visibility: string }>();
      const audience = row?.tagging_audience || "everyone";
      const mentions = row?.mentioning_visibility || "everyone";
      return json({ success: true, data: { allow_tagging: audience === "following" ? "followers" : audience, allow_mentioning: mentions === "following" ? "followers" : mentions } });
    }
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const current = await env.DB.prepare("SELECT tagging_audience,mentioning_visibility FROM user_privacy_settings WHERE user_id=?").bind(user.id).first<{ tagging_audience: string; mentioning_visibility: string }>();
    const tagging = str(b.allow_tagging, 20) || (current?.tagging_audience === "following" ? "followers" : current?.tagging_audience) || "everyone";
    const mentioning = str(b.allow_mentioning, 20) || (current?.mentioning_visibility === "following" ? "followers" : current?.mentioning_visibility) || "everyone";
    const valid = ["everyone", "followers", "nobody"];
    if (!valid.includes(tagging) || !valid.includes(mentioning)) return fail("Invalid tagging or mentioning preference");
    const storedTagging = tagging === "followers" ? "following" : tagging;
    const storedMentioning = mentioning === "followers" ? "following" : mentioning;
    await env.DB.prepare("INSERT INTO user_privacy_settings(user_id,tagging_audience,mentioning_visibility) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET tagging_audience=excluded.tagging_audience,mentioning_visibility=excluded.mentioning_visibility,updated_at=" + NOW)
      .bind(user.id, storedTagging, storedMentioning).run();
    return json({ success: true });
  }

  if (path === "/api/me/notification-preferences" && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    const read = async () => {
      const row = await env.DB.prepare("SELECT push_enabled,email_enabled,social_notifications_enabled,comment_notifications_enabled,follower_notifications_enabled,sms_enabled,order_notifications_enabled FROM notification_preferences WHERE user_id=?").bind(user.id).first<Record<string, number>>();
      return { push: !!(row?.push_enabled ?? 1), email: !!(row?.email_enabled ?? 1), sms: !!(row?.sms_enabled ?? 1), follows: !!(row?.follower_notifications_enabled ?? 1), comments: !!(row?.comment_notifications_enabled ?? 1), orders: !!(row?.order_notifications_enabled ?? 1) };
    };
    if (method === "GET") return json({ success: true, data: await read() });
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const current = await read();
    const val = (key: string) => typeof b[key] === "boolean" ? (b[key] ? 1 : 0) : (current as Record<string, boolean>)[key] ? 1 : 0;
    await env.DB.prepare("INSERT INTO notification_preferences(user_id,push_enabled,email_enabled,comment_notifications_enabled,follower_notifications_enabled,sms_enabled,order_notifications_enabled) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=excluded.push_enabled,email_enabled=excluded.email_enabled,comment_notifications_enabled=excluded.comment_notifications_enabled,follower_notifications_enabled=excluded.follower_notifications_enabled,sms_enabled=excluded.sms_enabled,order_notifications_enabled=excluded.order_notifications_enabled,updated_at=" + NOW)
      .bind(user.id, val("push"), val("email"), val("comments"), val("follows"), val("sms"), val("orders")).run();
    return json({ success: true });
  }

  if (path === "/api/me/profile-details-visibility" && (method === "GET" || method === "PATCH")) {
    if (!user) return fail("Unauthorized", 401);
    const defaults = { bio: "public", phone: "followers", email: "private", joined: "public", occupation: "public", location: "followers" };
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT bio,phone,email,joined,occupation,location FROM user_profile_details_visibility WHERE user_id=?").bind(user.id).first<Record<string, string>>();
      return json({ success: true, data: { ...defaults, ...(row || {}) } });
    }
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const allowed = ["bio", "phone", "email", "joined", "occupation", "location"] as const;
    const current = await env.DB.prepare("SELECT bio,phone,email,joined,occupation,location FROM user_profile_details_visibility WHERE user_id=?").bind(user.id).first<Record<string, string>>();
    const next: Record<string, string> = { ...defaults, ...(current || {}) };
    for (const key of allowed) {
      if (b[key] === undefined) continue;
      if (!["public", "followers", "private"].includes(String(b[key]))) return fail("Invalid profile detail visibility");
      next[key] = String(b[key]);
    }
    await env.DB.prepare("INSERT INTO user_profile_details_visibility(user_id,bio,phone,email,joined,occupation,location) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,phone=excluded.phone,email=excluded.email,joined=excluded.joined,occupation=excluded.occupation,location=excluded.location,updated_at=" + NOW)
      .bind(user.id, next.bio, next.phone, next.email, next.joined, next.occupation, next.location).run();
    return json({ success: true });
  }

  if (path === "/api/me/following" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const rows = await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.is_premium,f.created_at AS followed_at
      FROM user_follows f JOIN users u ON u.id=f.following_id
      WHERE f.follower_id=? AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
      ORDER BY f.created_at DESC LIMIT 200`).bind(user.id, user.id, user.id).all();
    return json({ success: true, data: rows.results });
  }

  if (path === "/api/me/personal-details" && method === "GET") {
    if (!user) return fail("Unauthorized", 401);
    const row = await env.DB.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,bio,date_of_birth,country_code,location_region,location_city,occupation,is_premium,profile_visibility FROM users WHERE id=? AND deleted_at IS NULL").bind(user.id).first<Record<string, unknown>>();
    return json({ success: true, data: row ? { ...row, country_iso: row.country_code, region: row.location_region, city: row.location_city, is_email_verified: !!row.email_verified, is_phone_verified: !!row.phone_verified } : null });
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
    await env.DB.prepare("UPDATE users SET " + assignments.join(",") + (fields.includes("phone") ? ",phone_verified=0,phone_verified_at=NULL" : "") + ",updated_at=" + NOW + " WHERE id=?").bind(...values).run();
    return json({ success: true });
  }

  if (path === "/api/legal" && method === "GET") {
    const rows = await env.DB.prepare(`SELECT d.id,d.slug,d.title,d.created_at,
      (SELECT v.version FROM legal_document_versions v WHERE v.document_id=d.id ORDER BY COALESCE(v.published_at,v.created_at) DESC LIMIT 1) AS latest_version
      FROM legal_documents d WHERE EXISTS(SELECT 1 FROM legal_document_versions v WHERE v.document_id=d.id)
      ORDER BY d.title`).all();
    return json({ success: true, data: rows.results.map((row: any) => ({ ...row, required: true })) });
  }
  const legalDocument = path.match(/^\/api\/legal\/([^/]+)$/);
  if (legalDocument && method === "GET") {
    const slug = decodeURIComponent(legalDocument[1]).toLowerCase();
    const document = await env.DB.prepare("SELECT id,slug,title,created_at FROM legal_documents WHERE slug=?").bind(slug).first<Record<string, unknown>>();
    if (!document) return fail("Legal document not found", 404);
    const requestedLanguage = str(url.searchParams.get("lang"), 5).toLowerCase();
    const language = ["en", "fr"].includes(requestedLanguage) ? requestedLanguage : "en";
    let version = await env.DB.prepare("SELECT id,version,language,content,published_at,created_at FROM legal_document_versions WHERE document_id=? AND language=? ORDER BY COALESCE(published_at,created_at) DESC LIMIT 1").bind(document.id, language).first<Record<string, unknown>>();
    if (!version && language !== "en") version = await env.DB.prepare("SELECT id,version,language,content,published_at,created_at FROM legal_document_versions WHERE document_id=? AND language='en' ORDER BY COALESCE(published_at,created_at) DESC LIMIT 1").bind(document.id).first<Record<string, unknown>>();
    if (!version) return fail("Legal document version not found", 404);
    return json({ success: true, data: { document: { ...document, description: null }, version: { ...version, version_label: version.version, effective_from: version.published_at || version.created_at, body_markdown: version.content } } });
  }
  const legalAcceptance = path.match(/^\/api\/legal\/([^/]+)\/accept$/);
  if (legalAcceptance && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b) return fail("Valid JSON body required");
    const document = await env.DB.prepare("SELECT id FROM legal_documents WHERE slug=?").bind(decodeURIComponent(legalAcceptance[1]).toLowerCase()).first<{ id: string }>();
    const versionId = str(b.version_id, 64);
    if (!document || !UUID.test(versionId)) return fail("Legal document or version not found", 404);
    const version = await env.DB.prepare("SELECT id FROM legal_document_versions WHERE id=? AND document_id=?").bind(versionId, document.id).first();
    if (!version) return fail("Legal document version not found", 404);
    await env.DB.prepare("INSERT OR IGNORE INTO user_legal_acceptances(user_id,version_id) VALUES(?,?)").bind(user.id, versionId).run();
    return json({ success: true });
  }

  if (path === "/api/me/deactivate" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET account_status='deactivated',signed_out_at=" + NOW + ",updated_at=" + NOW + " WHERE id=?").bind(user.id),
      env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at=" + NOW + " WHERE user_id=? AND status='active'").bind(user.id),
      env.DB.prepare("UPDATE notification_devices SET is_active=0,revoked_at=" + NOW + ",updated_at=" + NOW + " WHERE user_id=? AND is_active=1").bind(user.id)
    ]);
    return json({ success: true });
  }
  if (path === "/api/me" && method === "DELETE") {
    if (!user) return fail("Unauthorized", 401);
    const b = await body(request); if (!b || b.confirmation !== "DELETE") return fail("Explicit DELETE confirmation is required");
    await env.DB.batch([
      env.DB.prepare("UPDATE posts SET status='removed',deleted_at=" + NOW + " WHERE author_id=? AND deleted_at IS NULL").bind(user.id),
      env.DB.prepare("UPDATE marketplace_listings SET status='removed',deleted_at=" + NOW + " WHERE seller_id=? AND deleted_at IS NULL").bind(user.id),
      env.DB.prepare("UPDATE chat_thread_members SET left_at=" + NOW + " WHERE user_id=? AND left_at IS NULL").bind(user.id),
      env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at=" + NOW + " WHERE user_id=? AND status='active'").bind(user.id),
      env.DB.prepare("UPDATE notification_devices SET is_active=0,revoked_at=" + NOW + ",updated_at=" + NOW + " WHERE user_id=? AND is_active=1").bind(user.id),
      env.DB.prepare("DELETE FROM user_follows WHERE follower_id=? OR following_id=?").bind(user.id, user.id),
      env.DB.prepare("DELETE FROM friendships WHERE user_a_id=? OR user_b_id=?").bind(user.id, user.id),
      env.DB.prepare("UPDATE friend_requests SET status='cancelled',responded_at=" + NOW + ",updated_at=" + NOW + " WHERE (requester_id=? OR recipient_id=?) AND status='pending'").bind(user.id, user.id),
      env.DB.prepare("UPDATE users SET account_status='deactivated',deleted_at=" + NOW + ",username=NULL,email=NULL,phone=NULL,email_verified=0,email_verified_at=NULL,phone_verified=0,phone_verified_at=NULL,display_name='Deleted account',avatar_url=NULL,cover_url=NULL,bio=NULL,location_city=NULL,location_region=NULL,occupation=NULL,date_of_birth=NULL,profile_visibility='private',password_hash=NULL,auth_subject=NULL,signed_out_at=" + NOW + ",updated_at=" + NOW + " WHERE id=?").bind(user.id)
    ]);
    return json({ success: true });
  }

  return null;
}
