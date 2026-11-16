
export interface CorsEnv {
  ALLOWED_ORIGINS?: string;
}

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

const ALLOWED_HEADERS =
  "Content-Type, Authorization, X-Requested-With";

function getAllowedOrigins(env: CorsEnv): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function handleCors(
  request: Request,
  env: CorsEnv
): Response | null {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return request.method === "OPTIONS"
      ? new Response(null, { status: 403 })
      : null;
  }

  const allowedOrigins = getAllowedOrigins(env);

  if (!allowedOrigins.includes(origin)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Origin not allowed"
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }
    });
  }

  return null;
}

export function addCorsHeaders(
  response: Response,
  request: Request,
  env: CorsEnv
): Response {
  const origin = request.headers.get("Origin");

  if (!origin || !getAllowedOrigins(env).includes(origin)) {
    return response;
  }

  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
