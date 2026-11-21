export interface Env {
  CENPAYA_ORIGIN?: string;
  CENPAYA_ORIGINS?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_ALGORITHM?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_JWT_PRIVATE_JWK?: string;
  SUPABASE_JWT_KID?: string;
  D1_INTERNAL_CALL_SECRET?: string;
  D1_TO_SUPABASE_HMAC_SECRET?: string;
  PAYMENT_ENVIRONMENT?: string;
  D1_IDENTITY?: Fetcher;
}
