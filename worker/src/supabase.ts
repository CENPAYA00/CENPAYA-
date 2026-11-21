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
 * Uses a short-lived JWT for the restricted cenpaya_payment_worker Postgres role.
 * The role has no table privileges and can execute only the protected payment
 * functions installed by the Worker SQL migration. Never uses service_role.
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
