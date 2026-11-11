
export function originAllowed(request: Request, configuredOrigin?: string): boolean {
  const origin = request.headers.get('Origin');
  return origin === null ||
    (configuredOrigin !== undefined && origin === configuredOrigin);
}

export function corsHeaders(request: Request, configuredOrigin?: string): Headers {
  const headers = new Headers({
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers':
      'authorization, content-type, x-csrf-token',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  });

  const origin = request.headers.get('Origin');

  if (origin && configuredOrigin && origin === configuredOrigin) {
    headers.set('access-control-allow-origin', origin);
  }

  return headers;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get('Authorization');
  if (!value) return null;

  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function readJsonObject(
  request: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/json') return null;

  const length = Number(request.headers.get('content-length'));

  if (Number.isFinite(length) && length > maxBytes) return null;

  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > maxBytes) return null;

  try {
    const value: unknown = JSON.parse(body);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  } catch {
    return null;
  }
      }
