import { SupabaseClient } from "@supabase/supabase-js";

const DB_TIMEOUT_MS = 5_000;

export interface MaintenanceCheck {
  name: "database_read_access";
  status: "ok" | "failed";
  durationMs: number;
}

export interface MaintenanceReport {
  task: "supabase_database_maintenance";
  checkedAt: string;
  status: "ok" | "failed";
  checks: MaintenanceCheck[];
}

/**
 * Performs a bounded, read-only query using the public anon/publishable key.
 * currencies has an explicit public-read RLS policy, so this check does not
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

/**
 * Restricted scheduled maintenance monitor: it checks database read access
 * only, reports timing/status to Worker logs, and never mutates application data.
 */
export async function runDatabaseMaintenance(
  supabase: SupabaseClient,
): Promise<MaintenanceReport> {
  const startedAt = Date.now();
  const healthy = await checkDatabaseHealth(supabase);
  return {
    task: "supabase_database_maintenance",
    checkedAt: new Date().toISOString(),
    status: healthy ? "ok" : "failed",
    checks: [{
      name: "database_read_access",
      status: healthy ? "ok" : "failed",
      durationMs: Date.now() - startedAt,
    }],
  };
}
