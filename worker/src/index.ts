
import { Client } from 'pg';
import {
  corsHeaders,
  jsonResponse,
  originAllowed,
  readCookie,
  readJsonObject,
} from './http-utils';
import { checkDatabaseHealth } from './database';
import { readUserProfile, type ProfileQuery } from './profile';
import { randomToken, sha256, verifyPassword } from './auth-crypto';

interface Env {
  HYPERDRIVE: Hyperdrive;
  CENPAYA_ORIGIN: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_TTL_DAYS?: string;
}

interface AuthUser {
  id: string;
  email: string;
  password_hash: string | null;
  banned: number | boolean | null;
  is_deactivated: number | boolean | null;
  is_email_verified: number | boolean | null;
}

const SESSION_COOKIE = 'cenpaya_session';
const CSRF_COOKIE = 'cenpaya_csrf';
const SESSION_DAYS_DEFAULT = 30;

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    return ['1', 'true', 't', 'yes'].includes(value.toLowerCase());
  }

  return false;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function cookieOptions(maxAge: number): string {
  return `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function csrfCookieOptions(maxAge: number): string {
  return `Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || SESSION_COOKIE;
}

function sessionTtlSeconds(env: Env): number {
  const days = Number(env.SESSION_TTL_DAYS || SESSION_DAYS_DEFAULT);

  const safeDays =
    Number.isInteger(days) && days >= 1 && days <= 90
      ? days
      : SESSION_DAYS_DEFAULT;

  return safeDays * 24 * 60 * 60;
}

async function withClient<T>(
  env: Env,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });

  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Validate the CSRF token against:
 * 1. The CSRF cookie.
 * 2. The X-CSRF-Token request header.
 * 3. The hash stored in the authenticated database session.
 */
async function requireCsrf(
  request: Request,
  storedCsrfHash: string,
): Promise<boolean> {
  const cookie = readCookie(request, CSRF_COOKIE);
  const header = request.headers.get('X-CSRF-Token');

  if (!cookie || !header || !safeEqual(cookie, header)) {
    return false;
  }

  const submittedHash = hex(await sha256(cookie));

  return safeEqual(submittedHash, storedCsrfHash);
}

async function authenticateSession(
  request: Request,
  env: Env,
): Promise<{ userId: string; csrfHash: string } | null> {
  const token = readCookie(request, sessionCookieName(env));

  if (!token || token.length < 32 || token.length > 256) {
    return null;
  }

  const tokenHash = hex(await sha256(token));

  return withClient(env, async client => {
    const result = await client.query(
      `SELECT
          s.user_id,
          encode(s.csrf_token_hash, 'hex') AS csrf_hash,
          u.banned,
          u.is_deactivated
       FROM public.auth_sessions s
       JOIN public.users u ON u.id = s.user_id
       WHERE s.token_hash = decode($1, 'hex')
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    const row = result.rows[0];

    if (!row) return null;

    if (asBool(row.banned) || asBool(row.is_deactivated)) {
      await client.query(
        `UPDATE public.auth_sessions
         SET revoked_at = NOW()
         WHERE token_hash = decode($1, 'hex')
           AND revoked_at IS NULL`,
        [tokenHash],
      );

      return null;
    }

    await client.query(
      `UPDATE public.auth_sessions
       SET last_seen_at = NOW()
       WHERE token_hash = decode($1, 'hex')`,
      [tokenHash],
    );

    return {
      userId: String(row.user_id),
      csrfHash: String(row.csrf_hash),
    };
  });
}

async function login(
  request: Request,
  env: Env,
  headers: Headers,
): Promise<Response> {
  const body = await readJsonObject(request);

  if (
    !body ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return jsonResponse({ error: 'invalid_request' }, 400, headers);
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  if (
    email.length < 3 ||
    email.length > 254 ||
    password.length < 1 ||
    password.length > 128
  ) {
    return jsonResponse({ error: 'invalid_credentials' }, 401, headers);
  }

  return withClient(env, async client => {
    const result = await client.query<AuthUser>(
      `SELECT
          id,
          email,
          password_hash,
          banned,
          is_deactivated,
          is_email_verified
       FROM public.users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return jsonResponse({ error: 'invalid_credentials' }, 401, headers);
    }

    if (asBool(user.banned) || asBool(user.is_deactivated)) {
      return jsonResponse({ error: 'account_unavailable' }, 403, headers);
    }

    if (!asBool(user.is_email_verified)) {
      return jsonResponse({ error: 'email_not_verified' }, 403, headers);
    }

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      return jsonResponse({ error: 'invalid_credentials' }, 401, headers);
    }

    const sessionToken = await randomToken(32);
    const csrfToken = await randomToken(32);

    const sessionHash = hex(await sha256(sessionToken));
    const csrfHash = hex(await sha256(csrfToken));

    const ttl = sessionTtlSeconds(env);

    await client.query(
      `INSERT INTO public.auth_sessions
         (user_id, token_hash, csrf_token_hash, expires_at)
       VALUES
         ($1, decode($2, 'hex'), decode($3, 'hex'),
          NOW() + ($4 * INTERVAL '1 second'))`,
      [user.id, sessionHash, csrfHash, ttl],
    );

    await client.query(
      `UPDATE public.users
       SET last_active_at = NOW()
       WHERE id = $1`,
      [user.id],
    );

    headers.append(
      'Set-Cookie',
      `${sessionCookieName(env)}=${encodeURIComponent(sessionToken)}; ${cookieOptions(ttl)}`,
    );

    headers.append(
      'Set-Cookie',
      `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${csrfCookieOptions(ttl)}`,
    );

    return jsonResponse(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
        },
      },
      200,
      headers,
    );
  });
}

async function logout(
  request: Request,
  env: Env,
  headers: Headers,
): Promise<Response> {
  const session = await authenticateSession(request, env);

  if (session) {
    const csrfValid = await requireCsrf(request, session.csrfHash);

    if (!csrfValid) {
      return jsonResponse({ error: 'csrf_invalid' }, 403, headers);
    }

    const token = readCookie(request, sessionCookieName(env));

    if (token) {
      const tokenHash = hex(await sha256(token));

      await withClient(env, async client => {
        await client.query(
          `UPDATE public.auth_sessions
           SET revoked_at = NOW()
           WHERE token_hash = decode($1, 'hex')
             AND revoked_at IS NULL`,
          [tokenHash],
        );
      });
    }
  }

  headers.append(
    'Set-Cookie',
    `${sessionCookieName(env)}=; ${cookieOptions(0)}`,
  );

  headers.append(
    'Set-Cookie',
    `${CSRF_COOKIE}=; ${csrfCookieOptions(0)}`,
  );

  return jsonResponse({ success: true }, 200, headers);
}

async function me(
  request: Request,
  env: Env,
  headers: Headers,
): Promise<Response> {
  const session = await authenticateSession(request, env);

  if (!session) {
    return jsonResponse({ error: 'unauthorized' }, 401, headers);
  }

  return withClient(env, async client => {
    const query: ProfileQuery = (sql, values) =>
      client.query(sql, [...values]);

    const profile = await readUserProfile(query, session.userId);

    if (!profile) {
      return jsonResponse({ error: 'profile_not_found' }, 404, headers);
    }

    return jsonResponse(
      {
        user: {
          id: profile.id,
          email: profile.email,
        },
        profile,
        csrf_token: readCookie(request, CSRF_COOKIE),
      },
      200,
      headers,
    );
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env.CENPAYA_ORIGIN);
    const url = new URL(request.url);

    if (!originAllowed(request, env.CENPAYA_ORIGIN)) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/healthz' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200, headers);
    }

    if (
      url.pathname === '/api/v1/auth/login' &&
      request.method === 'POST'
    ) {
      try {
        return await login(request, env, headers);
      } catch {
        return jsonResponse(
          { error: 'authentication_unavailable' },
          503,
          headers,
        );
      }
    }

    if (
      url.pathname === '/api/v1/auth/logout' &&
      request.method === 'POST'
    ) {
      try {
        return await logout(request, env, headers);
      } catch {
        return jsonResponse(
          { error: 'logout_unavailable' },
          503,
          headers,
        );
      }
    }

    if (url.pathname === '/api/v1/me' && request.method === 'GET') {
      try {
        return await me(request, env, headers);
      } catch {
        return jsonResponse(
          { error: 'profile_unavailable' },
          503,
          headers,
        );
      }
    }

    if (
      url.pathname === '/api/v1/healthz/db' &&
      request.method === 'GET'
    ) {
      try {
        const healthy = await checkDatabaseHealth(
          env.HYPERDRIVE.connectionString,
        );

        return jsonResponse(
          { status: healthy ? 'ok' : 'unavailable' },
          healthy ? 200 : 503,
          headers,
        );
      } catch {
        return jsonResponse(
          { status: 'unavailable' },
          503,
          headers,
        );
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'not_implemented' }, 501, headers);
    }

    return jsonResponse({ error: 'not_found' }, 404, headers);
  },
} satisfies ExportedHandler<Env>;
  
