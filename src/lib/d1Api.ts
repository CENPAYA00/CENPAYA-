const API_BASE = String(import.meta.env.VITE_D1_API_URL ?? '').trim().replace(/\/$/, '');
let sessionToken: string | null = null;
let sessionTokenExpiresAt = 0;
let refreshInFlight: Promise<string | null> | null = null;
let refreshInFlightGeneration = -1;
let sessionGeneration = 0;

export type D1User = {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  country_iso?: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  role: string;
  onboarding_completed: boolean;
};

type ApiResult<T> = T & { success?: boolean; error?: string };

export class D1ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'D1ApiError';
    this.status = status;
  }
}

export function getD1Token(): string | null {
  if (sessionToken && Date.now() >= sessionTokenExpiresAt - 30_000) { sessionToken = null; sessionTokenExpiresAt = 0; }
  return sessionToken;
}

export function setD1Token(token: string | null) {
  sessionGeneration += 1;
  sessionToken = token;
  sessionTokenExpiresAt = token ? Date.now() + 900_000 : 0;
  // Detach any refresh started under the previous session generation.
  refreshInFlight = null;
  refreshInFlightGeneration = -1;
}

export function refreshD1Session(force = false): Promise<string | null> {
  if (!force && getD1Token()) return Promise.resolve(sessionToken);
  const generationAtStart = sessionGeneration;
  if (refreshInFlight && refreshInFlightGeneration === generationAtStart) return refreshInFlight;
  const refresh = (async (): Promise<string | null> => {
    try {
      const response = await fetch(getD1ApiUrl('/api/auth/refresh'), {
        method: 'POST', credentials: 'include', cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as { token?: string; expires_in?: number };
      const nextToken = response.ok && typeof payload.token === 'string' ? payload.token : null;
      // A logout or newer explicit token update must not be overwritten by a stale refresh.
      if (sessionGeneration === generationAtStart) {
        sessionToken = nextToken;
        sessionTokenExpiresAt = nextToken ? Date.now() + Math.max(60, Number(payload.expires_in) || 900) * 1000 : 0;
      }
      return sessionGeneration === generationAtStart ? nextToken : sessionToken;
    } catch {
      if (sessionGeneration === generationAtStart) { sessionToken = null; sessionTokenExpiresAt = 0; }
      return sessionToken;
    }
  })();
  refreshInFlight = refresh;
  refreshInFlightGeneration = generationAtStart;
  void refresh.finally(() => {
    if (refreshInFlight === refresh) {
      refreshInFlight = null;
      refreshInFlightGeneration = -1;
    }
  });
  return refresh;
}

export function getD1ApiUrl(path: string): string {
  if (!API_BASE) throw new Error('D1 API is not configured. Set VITE_D1_API_URL to the deployed D1 Worker URL.');
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function d1Request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const run = async (token: string | null): Promise<Response> => {
    const requestHeaders = new Headers(options.headers);
    if (options.body && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
    return fetch(getD1ApiUrl(path), { ...options, headers: requestHeaders, credentials: 'include' });
  };
  let response: Response;
  try {
    response = await run(getD1Token());
    if (response.status === 401) {
      const refreshed = await refreshD1Session(true);
      if (refreshed) response = await run(refreshed);
    }
  } catch {
    throw new Error('Unable to reach CenPaya services. Check your connection and D1 API configuration.');
  }
  const payload = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || payload.success === false) {
    throw new D1ApiError(payload.error || `Request failed (${response.status})`, response.status);
  }
  return payload;
}

export function d1Register(input: {
  username: string; display_name: string; email: string; password: string;
  gender: string; date_of_birth: string; preferred_lang: 'en' | 'fr'; terms_accepted: true;
}) {
  return d1Request<{ user_id: string; verification_required: boolean; channel?: string; delivery_pending?: boolean }>(
    '/api/auth/register', { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function d1Login(identifier: string, password: string) {
  const result = await d1Request<{ user: D1User }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, password }),
  });
  await refreshD1Session(true); return result;
}

export async function d1VerifyOtp(user_id: string, code: string, purpose: 'verify_email' | 'verify_phone' | 'password_reset' = 'verify_email') {
  const result = await d1Request<{ user: D1User }>('/api/auth/verify', {
    method: 'POST', body: JSON.stringify({ user_id, code, purpose }),
  });
  await refreshD1Session(true); return result;
}

export function d1ResendOtp(identifier: string, purpose: 'verify_email' | 'verify_phone' = 'verify_email') {
  return d1Request<{ success: boolean; delivery_pending?: boolean }>('/api/auth/otp/resend', {
    method: 'POST', body: JSON.stringify({ identifier, purpose }),
  });
}

export function d1RequestPasswordReset(identifier: string) {
  return d1Request<{ success: boolean }>('/api/auth/password/request', {
    method: 'POST', body: JSON.stringify({ identifier }),
  });
}

export async function d1ResetPassword(identifier: string, code: string, new_password: string) {
  const result = await d1Request<{ user: D1User }>('/api/auth/password/reset', {
    method: 'POST', body: JSON.stringify({ identifier, code, new_password }),
  });
  await refreshD1Session(true); return result;
}

export function d1Me() {
  return d1Request<{ user: D1User }>('/api/me');
}

export function d1UpdateProfile(input: Record<string, unknown>) {
  return d1Request<{ user: D1User }>('/api/me/profile', {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export async function d1Logout() {
  try { await d1Request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }); }
  finally { setD1Token(null); }
}
