import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Env } from "./env.js";

export function createUserSupabaseClient(env: Env, userJwt: string): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("supabase_public_configuration_missing");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + userJwt } },
  });
}

export function createPublicSupabaseClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("supabase_public_configuration_missing");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Reserved for server-to-server payment operations only: reading Vault credentials
 * and invoking service-role-only payment settlement functions. Never use for
 * ordinary user reads/writes or browser-facing admin actions.
 */
export function createPaymentServiceClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("payment_service_credentials_not_configured");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
