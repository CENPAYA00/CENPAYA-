import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  ready: Boolean(supabaseUrl && supabaseAnonKey),
};

export function isSupabaseReady() {
  return supabaseConfig.ready;
}

export function getSupabaseConfigError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your environment variables.';
  }
  return null;
}

const safeUrl = supabaseConfig.ready ? supabaseUrl : 'https://placeholder.supabase.co';
const safeKey = supabaseConfig.ready ? supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
