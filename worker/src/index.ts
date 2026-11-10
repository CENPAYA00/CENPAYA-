import { Pool } from '@neondatabase/serverless';

interface Env {
  HYPERDRIVE: Hyperdrive;
  /** Exact production Pages origin; no wildcard origins are accepted. */
  CENPAYA_ORIGIN?: string;
  /** Existing Supabase Auth project URL; retained temporarily for identity verification. */
  SUPABASE_URL?: string;
  /** Existing Supabase anon/public key, used only to verify user sessions via /auth/v1/user. */
  SUPABASE_ANON_KEY?: string;
}

interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && env.CENPAYA_ORIGIN && origin === env.CENPAYA_ORIGIN) {
    headers.set('access-control-allow-origin', origin);
  }
  return headers;
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  // Non-browser/server-to-server requests may omit Origin. Browser origins must match exactly.
  return !origin || (!!env.CENPAYA_ORIGIN && origin === env.CENPAYA_ORIGIN);
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const authUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
  let response: Response;
  try {
    response = await fetch(authUrl, {
      headers: {
        authorization,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
  } catch {
    throw new Error('AUTH_PROVIDER_UNAVAILABLE');
  }

  if (!response.ok) return null;
  const result = await response.json() as Partial<AuthenticatedUser>;
  if (typeof result.id !== 'string' || result.id.length < 1) return null;
  return { id: result.id, email: result.email, role: result.role, user_metadata: result.user_metadata };
}

async function databaseHealth(env: Env): Promise<boolean> {
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 1 });
  try {
    // Constant query; no request values are interpolated into SQL.
    const result = await pool.query('select 1 as ok');
    return result.rows[0]?.ok === 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(request, env)) return json({ error: 'origin_not_allowed' }, 403, headers);
      return new Response(null, { status: 204, headers });
    }

    if (!originAllowed(request, env)) return json({ error: 'origin_not_allowed' }, 403, headers);

    if (url.pathname === '/healthz' && request.method === 'GET') {
      return json({ status: 'ok' }, 200, headers);
    }

    if (url.pathname === '/api/v1/me' && request.method === 'GET') {
      try {
        const user = await authenticate(request, env);
        if (!user) return json({ error: 'unauthorized' }, 401, headers);
        // Identity is derived from the verified Supabase session, never from request JSON/query params.
        return json({ user: { id: user.id, email: user.email ?? null } }, 200, headers);
      } catch {
        return json({ error: 'authentication_unavailable' }, 503, headers);
      }
    }

    if (url.pathname === '/api/v1/healthz/db' && request.method === 'GET') {
      try {
        const user = await authenticate(request, env);
        if (!user) return json({ error: 'unauthorized' }, 401, headers);
      } catch {
        return json({ error: 'authentication_unavailable' }, 503, headers);
      }
      try {
        const healthy = await databaseHealth(env);
        if (!healthy) return json({ status: 'unavailable' }, 503, headers);
        return json({ status: 'ok' }, 200, headers);
      } catch {
        // Do not leak driver messages, connection strings or stack traces.
        return json({ status: 'unavailable' }, 503, headers);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_implemented' }, 501, headers);
    }

    return json({ error: 'not_found' }, 404, headers);
  },
} satisfies ExportedHandler<Env>;
