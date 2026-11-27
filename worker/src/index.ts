import { Env } from "./env.js";
import { authenticateD1Session, IdentityError } from "./identity.js";
import { corsHeaders, jsonResponse, originAllowed } from "./http-utils.js";
import { checkDatabaseHealth, runDatabaseMaintenance } from "./database.js";
import { createPublicSupabaseClient } from "./supabase.js";
import { handleAuthenticatedApi } from "./routes.js";
import { handleAuthenticatedPaymentApi } from "./payments.js";

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
      const paymentResponse = await handleAuthenticatedPaymentApi(
        request, identity.userId, identity.supabase, env, headers,
      );
      if (paymentResponse) return paymentResponse;
      return await handleAuthenticatedApi(request, identity.userId, identity.supabase, headers, env);
    } catch (error) {
      if (error instanceof IdentityError) {
        return jsonResponse({ success: false, error: error.message }, error.status, headers);
      }
      return jsonResponse({ success: false, error: "internal_error" }, 500, headers);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const report = await runDatabaseMaintenance(createPublicSupabaseClient(env));
      console.info("scheduled_supabase_database_maintenance", JSON.stringify(report));
      if (report.status !== "ok") {
        console.error("scheduled_supabase_database_maintenance_failed");
        throw new Error("scheduled_supabase_database_maintenance_failed");
      }
    })());
  },
} satisfies ExportedHandler<Env>;
