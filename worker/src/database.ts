import { SupabaseClient } from "@supabase/supabase-js";

const DB_TIMEOUT_MS = 5_000;

/**
 * Uses only the project's public anon/publishable key.
 * currencies has an explicit public-read RLS policy, so this probe does not
 * require a service-role credential or bypass row-level security.
 */
export async function checkDatabaseHealth(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("currencies")
      .select("code")
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));

    return error === null;
  } catch {
    return false;
  }
}
