import { getD1Token } from './d1Api';

const API_BASE = String(import.meta.env.VITE_SUPABASE_WORKER_URL ?? '').trim().replace(/\/$/, '');

type ApiResult<T> = T & { success?: boolean; error?: string };

export class SupabaseWorkerError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SupabaseWorkerError';
    this.status = status;
  }
}

export function getSupabaseWorkerUrl(path: string): string {
  if (!API_BASE) {
    throw new Error('Supabase Worker is not configured. Set VITE_SUPABASE_WORKER_URL to the deployed Supabase Worker URL.');
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Admin/control-plane requests are sent to the Supabase Worker.
 * The D1 token is only an identity assertion for server-side verification;
 * it is never treated as a Supabase access token or database credential.
 */
export async function supabaseWorkerRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getD1Token();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(getSupabaseWorkerUrl(path), {
      ...options,
      headers,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Unable to reach CenPaya administrative services. Check the Supabase Worker configuration and your connection.');
  }

  const payload = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || payload.success === false) {
    throw new SupabaseWorkerError(payload.error || `Request failed (${response.status})`, response.status);
  }
  return payload;
}
