export function originAllowed(
  request: Request,
  configuredOrigin?: string | string[],
): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  const allowed = Array.isArray(configuredOrigin)
    ? configuredOrigin
    : configuredOrigin
      ? [configuredOrigin]
      : [];
  return allowed.includes(origin);
}

export function corsHeaders(
  request: Request,
  configuredOrigin?: string | string[],
): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
  });

  const origin = request.headers.get("Origin");
  const allowed = Array.isArray(configuredOrigin)
    ? configuredOrigin
    : configuredOrigin
      ? [configuredOrigin]
      : [];

  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
  }

  return headers;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value) return null;

  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export async function readJsonObject(
  request: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") return null;

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) return null;

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) return null;

    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
