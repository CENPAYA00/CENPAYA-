import { SupabaseClient } from '@supabase/supabase-js';

const DB_TIMEOUT_MS = 5_000;

/** Execute a health check query through the Supabase client. */
export async function checkDatabaseHealth(
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    // We attempt to query the 'users' table. 
    // If the connection works but the table is empty, data will be an empty array (healthy).
    // If the connection fails, error will be populated.
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));

    if (error) {
      return false;
    }
    
    return true; 
  } catch {
    return false;
  }
  }
