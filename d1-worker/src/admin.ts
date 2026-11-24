import type { Env, User } from "./types.js";

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
      ready: false,
      blocked_reason: "Voice calling has not been implemented yet.",
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
