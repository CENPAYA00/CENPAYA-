export type User = {
  id: string; username: string | null; display_name: string;
  email: string | null; phone: string | null; email_verified: number;
  phone_verified: number; role: string; account_status: string;
  banned: number; password_hash: string | null; onboarding_completed?: number;
};
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  OTP_PEPPER: string;
  OTP_DELIVERY?: Fetcher;
  SESSION_TTL_SECONDS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  AI_SEARCH_NAME?: string;
  CENPAYA_API?: Fetcher;
  AI?: { autorag: (name: string) => { search: (options: Record<string, unknown>) => Promise<unknown> } };
  CACHE?: KVNamespace;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  D1_INTERNAL_CALL_SECRET?: string;
  D1_TO_SUPABASE_HMAC_SECRET?: string;
  MEDIA_BUCKET?: R2Bucket;
  MEDIA_URL_SIGNING_SECRET?: string;
}
