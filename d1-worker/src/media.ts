import type { Env, User } from "./types.js";
import { uuid } from "./security.js";

type RouteContext = { url: URL; path: string; method: string; user: User | null };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ success: false, error: message }, status);
const MAX_URL_TTL = 7 * 24 * 60 * 60;

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, key: string, expires: number): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(key + ":" + expires));
  return toHex(new Uint8Array(signature));
}

function validKey(key: string): boolean {
  return key.startsWith("chat/") || key.startsWith("marketplace/") || key.startsWith("posts/") || key.startsWith("profiles/");
}

export async function signMediaUrl(env: Env, origin: string, key: string, ttlSeconds = 24 * 60 * 60): Promise<string | null> {
  const secret = env.MEDIA_URL_SIGNING_SECRET || "";
  if (!env.MEDIA_BUCKET || secret.length < 32 || !validKey(key)) return null;
  const expires = Math.floor(Date.now() / 1000) + Math.min(Math.max(ttlSeconds, 60), MAX_URL_TTL);
  const signature = await sign(secret, key, expires);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return origin.replace(/\/$/, "") + "/api/media/" + encodedKey + "?exp=" + expires + "&sig=" + signature;
}

export async function extractMediaKey(value: string, env: Env, requestUrl: URL, allowExpired = false): Promise<string | null> {
  const secret = env.MEDIA_URL_SIGNING_SECRET || "";
  if (!env.MEDIA_BUCKET || secret.length < 32 || !value) return null;
  let parsed: URL;
  try { parsed = new URL(value, requestUrl.origin); } catch { return null; }
  if (parsed.origin !== requestUrl.origin || !parsed.pathname.startsWith("/api/media/")) return null;
  let key: string;
  try {
    key = parsed.pathname.slice("/api/media/".length).split("/").map(decodeURIComponent).join("/");
  } catch { return null; }
  if (!validKey(key)) return null;
  const expires = Number(parsed.searchParams.get("exp"));
  const signature = parsed.searchParams.get("sig") || "";
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || (!allowExpired && expires <= now) || expires > now + MAX_URL_TTL || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const expected = await sign(secret, key, expires);
  return equalConstantTime(expected, signature) ? key : null;
}

export async function resolveMediaUrl(value: unknown, env: Env, origin: string): Promise<string | null> {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  if (/^https?:\/\//i.test(source)) {
    try {
      const key = await extractMediaKey(source, env, new URL(origin), true);
      return key ? await signMediaUrl(env, origin, key) : source;
    } catch { return source; }
  }
  return await signMediaUrl(env, origin, source);
}

function extensionFor(mime: string): string | null {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "application/pdf": "pdf", "text/plain": "txt", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
  };
  return extensions[mime.toLowerCase()] || null;
}

async function upload(request: Request, env: Env, user: User, url: URL, kind: "chat" | "market" | "post" | "profile"): Promise<Response> {
  const bucket = env.MEDIA_BUCKET;
  const signingSecret = env.MEDIA_URL_SIGNING_SECRET || "";
  if (!bucket || signingSecret.length < 32) {
    return fail("R2 media storage is not configured for this Worker", 503);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 22 * 1024 * 1024) return fail("Upload exceeds the maximum request size", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Valid multipart form data is required"); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("A file is required");
  const mime = file.type.split(";")[0].trim().toLowerCase();
  const extension = extensionFor(mime);
  if (!extension) return fail("Unsupported media file type");
  if (kind === "profile") {
    const profileKind = form.get("kind");
    if (profileKind !== "avatar" && profileKind !== "cover") return fail("Profile media kind must be avatar or cover");
    if (!mime.startsWith("image/")) return fail("Profile photos must be images");
    const maximum = profileKind === "avatar" ? 5 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size < 1 || file.size > maximum) return fail("Profile image is too large");
    const key = ["profiles", user.id, profileKind, uuid() + "." + extension].join("/");
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: { ownerId: user.id, purpose: profileKind === "avatar" ? "profile_avatar" : "profile_cover" }
    });
    const column = profileKind === "avatar" ? "avatar_url" : "cover_url";
    await env.DB.prepare("UPDATE users SET " + column + "=?,updated_at=" + "strftime('%Y-%m-%dT%H:%M:%fZ','now')" + " WHERE id=?").bind(key,user.id).run();
    const signedUrl = await signMediaUrl(env, url.origin, key);
    return signedUrl ? json({ success: true, url: signedUrl }) : fail("Could not authorize media URL", 503);
  }
  const folderValue = form.get("folder");
  if (typeof folderValue !== "string") return fail("An upload folder is required");
  const folder = folderValue.trim();
  if (kind === "chat") {
    const match = folder.match(/^chat\/([0-9a-f-]{36})\/(images?|voice)$/i);
    if (!match) return fail("Invalid chat media folder");
    const threadId = match[1];
    const purpose = match[2].toLowerCase() === "voice" ? "voice_note" : "image";
    const member = await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(threadId, user.id).first();
    if (!member) return fail("Conversation not found", 404);
    const allowed = purpose === "image"
      ? mime.startsWith("image/")
      : mime.startsWith("audio/");
    if (!allowed) return fail("The file type does not match the chat media folder");
    const maximum = purpose === "image" ? 10 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size < 1 || file.size > maximum) return fail("Chat media file is too large");
    const key = ["chat", threadId, user.id, uuid() + "." + extension].join("/");
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: { ownerId: user.id, threadId, purpose }
    });
    const signedUrl = await signMediaUrl(env, url.origin, key);
    return signedUrl ? json({ success: true, url: signedUrl }) : fail("Could not authorize media URL", 503);
  }

  if (kind === "post") {
    if (folder !== "posts" || !mime.startsWith("image/")) return fail("Only post images are supported by this upload route");
    if (file.size < 1 || file.size > 10 * 1024 * 1024) return fail("Post image is too large");
    const key = ["posts", user.id, uuid() + "." + extension].join("/");
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: { ownerId: user.id, purpose: "post_image" }
    });
    const signedUrl = await signMediaUrl(env, url.origin, key);
    return signedUrl ? json({ success: true, url: signedUrl }) : fail("Could not authorize media URL", 503);
  }

  const allowedFolders = new Set(["listings/images", "listings/documents", "services/images", "services/documents"]);
  if (!allowedFolders.has(folder)) return fail("Invalid marketplace media folder");
  const isImage = folder.endsWith("/images");
  const isAllowed = isImage
    ? mime.startsWith("image/")
    : ["application/pdf", "text/plain", "application/msword",
       "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
       "application/vnd.ms-excel",
       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
       "application/vnd.ms-powerpoint",
       "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime);
  if (!isAllowed) return fail("The file type does not match the marketplace media folder");
  const maximum = isImage ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size < 1 || file.size > maximum) return fail("Marketplace media file is too large");
  const key = ["marketplace", user.id, folder.replace("/", "-"), uuid() + "." + extension].join("/");
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: mime },
    customMetadata: { ownerId: user.id, folder, purpose: isImage ? "listing_image" : "listing_document" }
  });
  const signedUrl = await signMediaUrl(env, url.origin, key);
  return signedUrl ? json({ success: true, url: signedUrl }) : fail("Could not authorize media URL", 503);
}

export async function hydrateUserMedia(env: Env, origin: string, rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  return Promise.all(rows.map(async row => ({
    ...row,
    avatar_url: await resolveMediaUrl(row.avatar_url, env, origin),
    cover_url: await resolveMediaUrl(row.cover_url, env, origin)
  })));
}

export async function hydratePosts(env: Env, origin: string, rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  if (!rows.length) return rows;
  const ids = rows.map(row => String(row.id || "")).filter(Boolean);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => "?").join(",");
  const [mediaResult, tagResult] = await Promise.all([
    env.DB.prepare("SELECT id,post_id,media_type,r2_object_key,mime_type,file_size_bytes,width,height,duration_seconds,alt_text,position FROM post_media WHERE post_id IN (" + placeholders + ") ORDER BY post_id,position").bind(...ids).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT t.post_id,u.id,u.username,u.display_name,u.avatar_url FROM post_tagged_users t JOIN users u ON u.id=t.tagged_user_id WHERE t.post_id IN (" + placeholders + ") AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL ORDER BY t.created_at").bind(...ids).all<Record<string, unknown>>()
  ]);
  const mediaByPost = new Map<string, Array<Record<string, unknown>>>();
  for (const item of mediaResult.results) {
    const postId = String(item.post_id);
    const { r2_object_key, ...metadata } = item;
    const signedUrl = await signMediaUrl(env, origin, String(r2_object_key));
    const values = mediaByPost.get(postId) || [];
    values.push({ ...metadata, url: signedUrl });
    mediaByPost.set(postId, values);
  }
  const tagsByPost = new Map<string, Array<Record<string, unknown>>>();
  for (const tag of tagResult.results) {
    const postId = String(tag.post_id);
    const { post_id, ...taggedUser } = tag;
    const values = tagsByPost.get(postId) || [];
    values.push(taggedUser);
    tagsByPost.set(postId, values);
  }
  return Promise.all(rows.map(async row => {
    const media = mediaByPost.get(String(row.id)) || [];
    const urls = media.map(item => item.url).filter((value): value is string => typeof value === "string" && value.length > 0);
    const backgroundId = typeof row.background_id === "string" ? row.background_id : null;
    return {
      ...row,
      avatar_url: await resolveMediaUrl(row.avatar_url, env, origin),
      post_type: backgroundId && row.post_type === "text" ? "colored" : row.post_type,
      bg_color: backgroundId,
      media,
      media_urls: urls,
      image_url: urls.length ? urls.join(",") : (typeof row.image_url === "string" ? row.image_url : ""),
      tagged_users: tagsByPost.get(String(row.id)) || []
    };
  }));
}

export async function handleMediaRoutes(request: Request, env: Env, context: RouteContext): Promise<Response | null> {
  const { url, path, method, user } = context;
  if (path === "/api/me/media" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    return upload(request, env, user, url, "profile");
  }
  if (path === "/api/posts/media" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    return upload(request, env, user, url, "post");
  }
  if (path === "/api/chat/media" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    return upload(request, env, user, url, "chat");
  }
  if (path === "/api/market/media" && method === "POST") {
    if (!user) return fail("Unauthorized", 401);
    return upload(request, env, user, url, "market");
  }
  if (path.startsWith("/api/media/") && method === "GET") {
    const bucket = env.MEDIA_BUCKET;
    const signingSecret = env.MEDIA_URL_SIGNING_SECRET || "";
    if (!bucket || signingSecret.length < 32) return fail("R2 media storage is not configured for this Worker", 503);
    let key: string;
    try { key = path.slice("/api/media/".length).split("/").map(decodeURIComponent).join("/"); }
    catch { return fail("Invalid media key"); }
    if (!validKey(key)) return fail("Invalid media key");
    const expires = Number(url.searchParams.get("exp"));
    const signature = url.searchParams.get("sig") || "";
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_URL_TTL || !/^[a-f0-9]{64}$/i.test(signature)) return fail("Media URL expired or invalid", 403);
    const expected = await sign(signingSecret, key, expires);
    if (!equalConstantTime(expected, signature)) return fail("Media URL expired or invalid", 403);
    const object = await bucket.get(key);
    if (!object) return fail("Media not found", 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    if (key.includes("-documents/")) headers.set("Content-Disposition", "attachment");
    return new Response(object.body, { status: 200, headers });
  }
  return null;
}
