
import { jsonResponse } from "../lib/http.js";
import type { RouteHandler } from "../lib/router.js";

export interface HealthEnv {
  DB: D1Database;
}

export const healthHandler: RouteHandler<HealthEnv> = async ({
  env
}) => {
  try {
    await env.DB.prepare("SELECT 1").first();

    return jsonResponse({
      success: true,
      service: "cenpaya-d1-worker",
      database: "connected"
    });
  } catch {
    return jsonResponse(
      {
        success: false,
        service: "cenpaya-d1-worker",
        database: "unavailable"
      },
      503
    );
  }
};
