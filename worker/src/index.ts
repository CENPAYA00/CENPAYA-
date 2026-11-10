import {
  bearerToken,
  corsHeaders,
  jsonResponse,
  originAllowed,
} from './http-utils';
import { checkDatabaseHealth } from './database';

interface Env {
  HYPERDRIVE: Hyperdrive;
  /** Exact approved browser origin; wildcard origins are not accepted. */
  CENPAYA_ORIGIN?: string;
  /** Temporary compatibility while the frontend still uses Supabase Auth. */
  SUPABASE_URL?: string;
  /** Supabase public anon key; never use a service-role key here. */
  SUPABASE_ANON_KEY?: string;
}

interface AuthenticatedUser {
  id: string;
  email?: string;
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const authUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
  let response: Response;
  try {
    response = await fetch(authUrl, {
      signal: AbortSignal.timeout(5_000),
      headers: {
        authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
  } catch {
    throw new Error('AUTH_PROVIDER_UNAVAILABLE');
  }

  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || value.id.length === 0) {
    return null;
  }
  const user = value as AuthenticatedUser;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : undefined };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env.CENPAYA_ORIGIN);
    const url = new URL(request.url);

    if (!originAllowed(request, env.CENPAYA_ORIGIN)) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/healthz' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200, headers);
    }

    if (url.pathname === '/api/v1/me' && request.method === 'GET') {
      try {
        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: 'unauthorized' }, 401, headers);
        return jsonResponse({ user: { id: user.id, email: user.email ?? null } }, 200, headers);
      } catch {
        return jsonResponse({ error: 'authentication_unavailable' }, 503, headers);
      }
    }

    if (url.pathname === '/api/v1/healthz/db' && request.method === 'GET') {
      try {
        const user = await authenticate(request, env);
        if (!user) return jsonResponse({ error: 'unauthorized' }, 401, headers);
      } catch {
        return jsonResponse({ error: 'authentication_unavailable' }, 503, headers);
      }
      try {
        const healthy = await checkDatabaseHealth(env.HYPERDRIVE.connectionString);
        return jsonResponse({ status: healthy ? 'ok' : 'unavailable' }, healthy ? 200 : 503, headers);
      } catch {
        // Never expose driver errors, connection strings or stack traces to clients.
        return jsonResponse({ status: 'unavailable' }, 503, headers);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'not_implemented' }, 501, headers);
    }

    return jsonResponse({ error: 'not_found' }, 404, headers);
  },
} satisfies ExportedHandler<Env>;
