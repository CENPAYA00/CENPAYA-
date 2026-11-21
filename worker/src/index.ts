import { Env } from "./env";
import { authenticateD1Session, IdentityError } from "./identity";
import { corsHeaders, jsonResponse, originAllowed } from "./http-utils";
import { checkDatabaseHealth } from "./database";
import { createPublicSupabaseClient } from "./supabase";
import { handleAuthenticatedApi } from "./routes";

function configuredOrigins(env: Env): string[] {
  const values = (env.CENPAYA_ORIGINS || env.CENPAYA_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origins = configuredOrigins(env);
    const headers = corsHeaders(request, origins);

    if (!originAllowed(request, origins)) {
      return jsonResponse({ success: false, error: "origin_not_allowed" }, 403, headers);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return jsonResponse({ status: "ok" }, 200, headers);
    }

    if (url.pathname === "/api/v1/healthz/db" && request.method === "GET") {
      try {
        const healthy = await checkDatabaseHealth(createPublicSupabaseClient(env));
        return jsonResponse(
          { status: healthy ? "ok" : "unavailable" },
          healthy ? 200 : 503,
          headers,
        );
      } catch {
        return jsonResponse({ status: "unavailable" }, 503, headers);
      }
    }

    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse({ success: false, error: "not_found" }, 404, headers);
    }

    try {
      const identity = await authenticateD1Session(request, env);
      return await handleAuthenticatedApi(request, identity.userId, identity.supabase, headers);
    } catch (error) {
      if (error instanceof IdentityError) {
        return jsonResponse({ success: false, error: error.message }, error.status, headers);
      }
      return jsonResponse({ success: false, error: "internal_error" }, 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;
