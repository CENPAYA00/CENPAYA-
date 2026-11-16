
export interface Env {
  DB: D1Database;
}

function jsonResponse(
  data: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return jsonResponse(
        { success: false, error: "Method not allowed" },
        405
      );
    }

    if (url.pathname === "/health") {
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
    }

    return jsonResponse(
      { success: false, error: "Route not found" },
      404
    );
  }
};
