import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Env } from "./env.js";
import { signSupabasePaymentWorkerJwt } from "./jwt.js";

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
 * Uses a short-lived JWT with the existing authenticated Postgres role and a
 * private app_metadata.cenpaya_payment_worker claim. Privileged RPCs validate
 * that signed claim internally. Never uses service_role or a custom DB role.
 */
export async function createPaymentWorkerClient(env: Env, subject: string): Promise<SupabaseClient> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("payment_worker_public_configuration_missing");
  }
  const token = await signSupabasePaymentWorkerJwt(subject, env);
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
}
